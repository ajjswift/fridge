import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./password";

/**
 * A single SQLite file holds everything. It lives in ./data by default so it is
 * trivial to back up (copy the file) or reset (delete the file).
 */
const DB_PATH =
  process.env.RECIME_DB_PATH ?? path.join(process.cwd(), "data", "recime.db");

const SCHEMA = `
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

-- expiry_date is always a real day, even when the packet only says a month:
-- month-only dates are stored as the last day of that month so every ordering
-- and comparison keeps working. date_precision only affects how it's displayed.
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
`;

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

/**
 * The very first account, so there is something to sign in with on a fresh
 * install. Override with env vars before first run if you'd rather not use the
 * defaults; after that, change the password in Settings → People.
 */
const SEED_USERNAME = process.env.RECIME_SEED_USERNAME ?? "alex";
const SEED_PASSWORD =
  process.env.RECIME_SEED_PASSWORD ?? "TMR6var-fpt9ftz-kje";

/**
 * `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so columns added
 * after someone's database was created have to be filled in here. Adding a
 * column is cheap and idempotent; nothing else in the file needs versioning.
 */
const ADDED_COLUMNS: Array<[table: string, column: string, definition: string]> = [
  ["stock_entries", "date_type", "TEXT NOT NULL DEFAULT 'best_before'"],
  ["stock_entries", "date_precision", "TEXT NOT NULL DEFAULT 'day'"],
  ["products", "default_date_type", "TEXT"],
];

function applyColumnMigrations(db: Database.Database) {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
      name: string;
    }>;
    if (columns.some((c) => c.name === column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function createConnection(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  applyColumnMigrations(db);

  const seedLocations = db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS n FROM locations").get() as {
      n: number;
    };
    if (count.n > 0) return;
    const insert = db.prepare(
      `INSERT INTO locations (name, emoji, description, is_freezer, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
    );
    DEFAULT_LOCATIONS.forEach(([name, emoji, description, isFreezer], i) => {
      insert.run(name, emoji, description, isFreezer, i);
    });
  });
  seedLocations();

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
  );
  for (const [key, value] of DEFAULT_SETTINGS) insertSetting.run(key, value);

  // Only ever seeded into an empty users table, so changing or deleting the
  // first account doesn't bring it back on the next restart.
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get() as {
    n: number;
  };
  if (userCount.n === 0) {
    db.prepare(
      "INSERT INTO users (username, password_hash) VALUES (?, ?)",
    ).run(SEED_USERNAME, hashPassword(SEED_PASSWORD));
  }

  // Expired sessions are dead weight; clear them on boot.
  db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

  return db;
}

// Next's dev server re-evaluates modules on every hot reload; cache the handle
// on globalThis so we don't leak file descriptors.
const globalForDb = globalThis as unknown as { __recimeDb?: Database.Database };

export const db: Database.Database = globalForDb.__recimeDb ?? createConnection();

if (process.env.NODE_ENV !== "production") globalForDb.__recimeDb = db;

export { DB_PATH };
