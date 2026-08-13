/**
 * A thin abstraction over better-sqlite3 (sync) and pg (async) so every
 * database call in the app goes through the same interface. The SQL stays raw
 * — no ORM, no query builder — but the calling convention is unified.
 *
 * All SQL should use `?` positional parameters. The PostgreSQL adapter rewrites
 * them to `$1, $2, …` before sending the query.
 */

/* ---------------------------------------------------------------- interface */

export interface RunResult {
  lastId: number;
  changes: number;
}

export interface DatabaseAdapter {
  /** Fetch a single row (or undefined). */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;

  /** Fetch all matching rows. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;

  /** Execute a statement that modifies data. */
  run(sql: string, ...params: unknown[]): Promise<RunResult>;

  /** Execute raw SQL (DDL, multi-statement scripts). */
  exec(sql: string): Promise<void>;

  /** Run `fn` inside a transaction. The argument is a transactional adapter. */
  transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T>;

  /** The SQL expression for "right now" — `datetime('now')` or `NOW()`. */
  readonly nowExpr: string;

  /** Which engine is active — useful for the rare query that truly can't be shared. */
  readonly dialect: "sqlite" | "postgres";

  /** Graceful shutdown. */
  close(): Promise<void>;
}

/* ------------------------------------------------------------- SQLite impl */

import type Database from "better-sqlite3";

export class SqliteAdapter implements DatabaseAdapter {
  readonly nowExpr = "datetime('now')";
  readonly dialect = "sqlite" as const;

  constructor(private readonly db: Database.Database) {}

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const info = this.db.prepare(sql).run(...params);
    return { lastId: Number(info.lastInsertRowid), changes: info.changes };
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // better-sqlite3 transactions are synchronous, but our fn is async. We wrap
    // the sync transaction helper around a flag-and-retry approach: run the
    // async function, then use savepoints to ensure atomicity.
    //
    // Simpler: since this is a single-connection in-process database, we can
    // just use BEGIN/COMMIT directly — the connection isn't shared.
    this.db.exec("BEGIN");
    try {
      const result = await fn(this);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/* --------------------------------------------------------- PostgreSQL impl */

import type { Pool, PoolClient } from "pg";

/** Rewrite parameter markers without touching quoted SQL string literals. */
function toPgParams(sql: string): string {
  let index = 0;
  let result = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      result += char;
      if (char === quote) {
        // SQL escapes a quote inside a literal by writing it twice.
        if (sql[i + 1] === quote) {
          result += sql[i + 1];
          i += 1;
        } else {
          quote = null;
        }
      }
    } else if (char === "'" || char === '"') {
      quote = char;
      result += char;
    } else {
      result += char === "?" ? `$${++index}` : char;
    }
  }

  return result;
}

function normalizeRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  return Object.fromEntries(
    Object.entries(row as Record<string, unknown>).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString().replace("T", " ").replace("Z", "")
        : value,
    ]),
  ) as T;
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly nowExpr = "NOW()";
  readonly dialect = "postgres" as const;

  constructor(private readonly pool: Pool) {}

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const { rows } = await this.pool.query(toPgParams(sql), params);
    return rows[0] ? normalizeRow(rows[0] as T) : undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const { rows } = await this.pool.query(toPgParams(sql), params);
    return rows.map((row) => normalizeRow(row as T));
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const result = await this.pool.query(toPgParams(sql), params);
    return {
      lastId: result.rows?.[0]?.id ?? 0,
      changes: result.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txAdapter = new PostgresClientAdapter(client);
      const result = await fn(txAdapter);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** A transaction-scoped adapter that runs on a checked-out client. */
class PostgresClientAdapter implements DatabaseAdapter {
  readonly nowExpr = "NOW()";
  readonly dialect = "postgres" as const;

  constructor(private readonly client: PoolClient) {}

  async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    const { rows } = await this.client.query(toPgParams(sql), params);
    return rows[0] ? normalizeRow(rows[0] as T) : undefined;
  }

  async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    const { rows } = await this.client.query(toPgParams(sql), params);
    return rows.map((row) => normalizeRow(row as T));
  }

  async run(sql: string, ...params: unknown[]): Promise<RunResult> {
    const result = await this.client.query(toPgParams(sql), params);
    return {
      lastId: result.rows?.[0]?.id ?? 0,
      changes: result.rowCount ?? 0,
    };
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql);
  }

  async transaction<T>(fn: (tx: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Already inside a transaction — savepoints give nested semantics.
    const name = `sp_${Date.now()}`;
    await this.client.query(`SAVEPOINT ${name}`);
    try {
      const result = await fn(this);
      await this.client.query(`RELEASE SAVEPOINT ${name}`);
      return result;
    } catch (error) {
      await this.client.query(`ROLLBACK TO SAVEPOINT ${name}`);
      throw error;
    }
  }

  async close(): Promise<void> {
    /* no-op: the parent adapter owns the pool */
  }
}
