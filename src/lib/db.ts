import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";
import type { DatabaseAdapter } from "./db-adapter";

/**
 * When `DATABASE_URL` is set (e.g. `postgres://user:pass@host/recime`), the
 * app connects to PostgreSQL. Otherwise it falls back to a local SQLite file
 * in `./data/recime.db` — zero config for the single-machine case.
 */
const DATABASE_URL = process.env.DATABASE_URL ?? null;

const DB_PATH =
  process.env.RECIME_DB_PATH ?? path.join(process.cwd(), "data", "recime.db");

/* -------------------------------------------------------------- schemas -- */

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS locations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  emoji        TEXT    NOT NULL DEFAULT '📦',
  description  TEXT,
  is_freezer   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  name                TEXT    NOT NULL,
  brand               TEXT,
  barcode             TEXT    UNIQUE,
  image_url           TEXT,
  category            TEXT,
  unit                TEXT    NOT NULL DEFAULT 'item',
  default_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  default_expiry_days INTEGER,
  default_date_type   TEXT,
  min_stock           REAL    NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id     INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  location_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity       REAL    NOT NULL,
  expiry_date    TEXT,
  date_type      TEXT    NOT NULL DEFAULT 'best_before',
  date_precision TEXT    NOT NULL DEFAULT 'day',
  opened_at      TEXT,
  purchased_at   TEXT,
  note           TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  quantity    REAL    NOT NULL DEFAULT 1,
  unit        TEXT,
  checked     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT    NOT NULL,
  product_id    INTEGER,
  product_name  TEXT    NOT NULL,
  location_name TEXT,
  quantity      REAL,
  unit          TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT,
  password_hash TEXT    NOT NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT    NOT NULL UNIQUE,
  p256dh       TEXT    NOT NULL,
  auth         TEXT    NOT NULL,
  label        TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  last_sent_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stock_product  ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON stock_entries(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_expiry   ON stock_entries(expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_code  ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user      ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
`;

const POSTGRES_SCHEMA = `
CREATE TABLE IF NOT EXISTS locations (
  id           SERIAL PRIMARY KEY,
  name         TEXT    NOT NULL,
  emoji        TEXT    NOT NULL DEFAULT '📦',
  description  TEXT,
  is_freezer   INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id                  SERIAL PRIMARY KEY,
  name                TEXT    NOT NULL,
  brand               TEXT,
  barcode             TEXT    UNIQUE,
  image_url           TEXT,
  category            TEXT,
  unit                TEXT    NOT NULL DEFAULT 'item',
  default_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  default_expiry_days INTEGER,
  default_date_type   TEXT,
  min_stock           DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_entries (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  location_id    INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  quantity       DOUBLE PRECISION NOT NULL,
  expiry_date    TEXT,
  date_type      TEXT    NOT NULL DEFAULT 'best_before',
  date_precision TEXT    NOT NULL DEFAULT 'day',
  opened_at      TEXT,
  purchased_at   TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shopping_items (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name        TEXT    NOT NULL,
  quantity    DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit        TEXT,
  checked     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity (
  id            SERIAL PRIMARY KEY,
  kind          TEXT    NOT NULL,
  product_id    INTEGER,
  product_name  TEXT    NOT NULL,
  location_name TEXT,
  quantity      DOUBLE PRECISION,
  unit          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT,
  password_hash TEXT    NOT NULL,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint     TEXT    NOT NULL UNIQUE,
  p256dh       TEXT    NOT NULL,
  auth         TEXT    NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_stock_product  ON stock_entries(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON stock_entries(location_id);
CREATE INDEX IF NOT EXISTS idx_stock_expiry   ON stock_entries(expiry_date);
CREATE INDEX IF NOT EXISTS idx_products_code  ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_user      ON push_subscriptions(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
`;

/* ---------------------------------------------------------- seed data -- */

const DEFAULT_LOCATIONS: Array<[string, string, string, number]> = [
  ["Fridge", "🧊", "Milk, cheese, leftovers", 0],
  ["Freezer", "❄️", "Frozen veg, meat, ice cream", 1],
  ["Pantry", "🥫", "Tins, pasta, rice, jars", 0],
  ["Cupboard", "🍪", "Snacks, cereal, bread", 0],
  ["Fruit & veg", "🥦", "The bowl and the veg drawer", 0],
  ["Drinks", "🧃", "Juice, fizzy, beer", 0],
];

const DEFAULT_SETTINGS: Array<[string, string]> = [
  ["expiry_soon_days", "5"],
  ["household_name", "Our kitchen"],
  ["notify_enabled", "1"],
  ["notify_time", "08:30"],
];

const SEED_USERNAME = process.env.RECIME_SEED_USERNAME?.trim();
const SEED_PASSWORD = process.env.RECIME_SEED_PASSWORD;

/* ---------------------------------------------------------- migrations -- */

/**
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so columns added
 * after someone's database was created have to be filled in here. Adding a
 * column is cheap and idempotent; nothing else in the file needs versioning.
 */
const ADDED_COLUMNS: Array<[table: string, column: string, sqliteDef: string, pgDef: string]> = [
  ["stock_entries", "date_type", "TEXT NOT NULL DEFAULT 'best_before'", "TEXT NOT NULL DEFAULT 'best_before'"],
  ["stock_entries", "date_precision", "TEXT NOT NULL DEFAULT 'day'", "TEXT NOT NULL DEFAULT 'day'"],
  ["products", "default_date_type", "TEXT", "TEXT"],
];

async function applyColumnMigrations(db: DatabaseAdapter) {
  for (const [table, column, sqliteDef, pgDef] of ADDED_COLUMNS) {
    if (db.dialect === "sqlite") {
      const columns = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
      if (columns.some((c) => c.name === column)) continue;
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqliteDef}`);
    } else {
      const exists = await db.get<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = ? AND column_name = ?`,
        table,
        column,
      );
      if (exists) continue;
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${pgDef}`);
    }
  }
}

/* ---------------------------------------------------------- connection -- */

async function createSqliteAdapter(): Promise<DatabaseAdapter> {
  const BetterSqlite = (await import("better-sqlite3")).default;
  const { SqliteAdapter } = await import("./db-adapter");

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const raw = new BetterSqlite(DB_PATH);
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");

  const db = new SqliteAdapter(raw);
  await db.exec(SQLITE_SCHEMA);
  return db;
}

async function createPostgresAdapter(): Promise<DatabaseAdapter> {
  const { Pool, types } = await import("pg");
  const { PostgresAdapter } = await import("./db-adapter");

  // PostgreSQL returns COUNT() (int8) as a string by default. The UI and
  // action guards rely on these values being numbers, just as they are under
  // SQLite. Recime's counts can never approach Number's safe-integer limit.
  types.setTypeParser(types.builtins.INT8, Number);
  const pool = new Pool({ connectionString: DATABASE_URL! });
  pool.on("error", (error) => {
    // Idle-client errors otherwise surface as an unhandled EventEmitter error
    // and can take down the whole web process.
    console.error("[recime] PostgreSQL pool error", error);
  });
  const db = new PostgresAdapter(pool);
  try {
    await db.exec(POSTGRES_SCHEMA);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function createAdapter(): Promise<DatabaseAdapter> {
  const db = DATABASE_URL
    ? await createPostgresAdapter()
    : await createSqliteAdapter();

  try {
    await applyColumnMigrations(db);
    await seedData(db);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function seedData(db: DatabaseAdapter) {
  // Locations
  const locCount = await db.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM locations");
  if (Number(locCount?.n ?? 0) === 0) {
    for (let i = 0; i < DEFAULT_LOCATIONS.length; i++) {
      const [name, emoji, description, isFreezer] = DEFAULT_LOCATIONS[i];
      await db.run(
        `INSERT INTO locations (name, emoji, description, is_freezer, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
        name,
        emoji,
        description,
        isFreezer,
        i,
      );
    }
  }

  // Settings (insert-or-ignore)
  for (const [key, value] of DEFAULT_SETTINGS) {
    if (db.dialect === "sqlite") {
      await db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", key, value);
    } else {
      await db.run(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO NOTHING",
        key,
        value,
      );
    }
  }

  // Seed user
  const userCount = await db.get<{ n: number | string }>("SELECT COUNT(*) AS n FROM users");
  if (Number(userCount?.n ?? 0) === 0) {
    if (!SEED_USERNAME || !SEED_PASSWORD) {
      throw new Error(
        "RECIME_SEED_USERNAME and RECIME_SEED_PASSWORD must be set before the first run.",
      );
    }
    await db.run(
      "INSERT INTO users (username, password_hash) VALUES (?, ?) ON CONFLICT DO NOTHING",
      SEED_USERNAME,
      hashPassword(SEED_PASSWORD),
    );
  }

  // Expired sessions
  if (db.dialect === "sqlite") {
    await db.run("DELETE FROM sessions WHERE expires_at < datetime('now')");
  } else {
    await db.run("DELETE FROM sessions WHERE expires_at < NOW()");
  }
}

// Next's dev server re-evaluates modules on every hot reload; cache the handle
// on globalThis so we don't leak file descriptors or pool connections.
const globalForDb = globalThis as unknown as { __recimeDb?: DatabaseAdapter };
let dbPromise: Promise<DatabaseAdapter> | undefined = globalForDb.__recimeDb
  ? Promise.resolve(globalForDb.__recimeDb)
  : undefined;

/**
 * The single database handle. Awaiting this is essentially free after the
 * first call — it caches the resolved adapter on `globalThis`.
 */
export function getDb(): Promise<DatabaseAdapter> {
  if (!dbPromise) {
    dbPromise = createAdapter()
      .then((adapter) => {
        globalForDb.__recimeDb = adapter;
        return adapter;
      })
      .catch((error) => {
        // A database that is temporarily unavailable at startup should recover
        // on the next request rather than leaving this process permanently
        // poisoned by one rejected initialization promise.
        dbPromise = undefined;
        console.error("[recime] database initialization failed", error);
        throw error;
      });
  }
  return dbPromise;
}

export { DB_PATH, DATABASE_URL };
