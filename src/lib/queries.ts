import "server-only";
import { getDb } from "./db";
import { addDaysISO, todayISO } from "./dates";
import type {
  Activity,
  DatePrecision,
  DateType,
  Location,
  LocationSummary,
  Product,
  ShoppingItem,
  StockEntryDetail,
  StockLine,
} from "./types";

export async function getSetting(key: string, fallback: string): Promise<string> {
  const db = await getDb();
  const row = await db.get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? fallback;
}

export async function getSoonDays(): Promise<number> {
  const n = Number(await getSetting("expiry_soon_days", "5"));
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export async function getLocations(): Promise<Location[]> {
  const db = await getDb();
  return db.all<Location>("SELECT * FROM locations ORDER BY sort_order, LOWER(name)");
}

export async function getLocation(id: number): Promise<Location | undefined> {
  const db = await getDb();
  return db.get<Location>("SELECT * FROM locations WHERE id = ?", id);
}

export async function getLocationSummaries(): Promise<LocationSummary[]> {
  const [db, today, soonDays] = await Promise.all([getDb(), Promise.resolve(todayISO()), getSoonDays()]);
  const soon = addDaysISO(soonDays, today);
  return db.all<LocationSummary>(
    `SELECT l.*,
            COUNT(DISTINCT s.product_id) AS product_count,
            COALESCE(SUM(s.quantity), 0) AS total_quantity,
            COUNT(DISTINCT CASE WHEN s.expiry_date < ? THEN s.id END) AS expired_count,
            COUNT(DISTINCT CASE WHEN s.expiry_date >= ? AND s.expiry_date <= ? THEN s.id END) AS soon_count
       FROM locations l
       LEFT JOIN stock_entries s ON s.location_id = l.id AND s.quantity > 0
      GROUP BY l.id
      ORDER BY l.sort_order, LOWER(l.name)`,
    today,
    today,
    soon,
  );
}

const STOCK_LINE_SELECT = `
  SELECT p.id AS product_id, p.name AS name, p.brand AS brand,
         p.image_url AS image_url, p.unit AS unit,
         l.id AS location_id, l.name AS location_name, l.emoji AS location_emoji,
         SUM(s.quantity) AS quantity, COUNT(s.id) AS entry_count,
         MIN(s.expiry_date) AS next_expiry,
         (SELECT s2.date_type FROM stock_entries s2
           WHERE s2.product_id = p.id AND s2.location_id = l.id AND s2.quantity > 0
           ORDER BY (s2.expiry_date IS NULL), s2.expiry_date LIMIT 1) AS next_date_type,
         (SELECT s2.date_precision FROM stock_entries s2
           WHERE s2.product_id = p.id AND s2.location_id = l.id AND s2.quantity > 0
           ORDER BY (s2.expiry_date IS NULL), s2.expiry_date LIMIT 1) AS next_date_precision,
         MAX(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS any_opened
    FROM stock_entries s
    JOIN products p ON p.id = s.product_id
    JOIN locations l ON l.id = s.location_id
   WHERE s.quantity > 0`;

export async function getStockLinesByLocation(locationId: number): Promise<StockLine[]> {
  const db = await getDb();
  return db.all<StockLine>(
    `${STOCK_LINE_SELECT} AND s.location_id = ?
      GROUP BY p.id, l.id
      ORDER BY (MIN(s.expiry_date) IS NULL), MIN(s.expiry_date), LOWER(p.name)`,
    locationId,
  );
}

export async function searchStockLines(query: string): Promise<StockLine[]> {
  const db = await getDb();
  const q = `%${query.trim().toLowerCase()}%`;
  return db.all<StockLine>(
    `${STOCK_LINE_SELECT}
       AND (LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.brand, '')) LIKE ? OR LOWER(COALESCE(p.barcode, '')) LIKE ?)
      GROUP BY p.id, l.id
      ORDER BY LOWER(p.name)
      LIMIT 60`,
    q,
    q,
    q,
  );
}

export type ExpiringLine = StockLine & {
  expiry_date: string;
  date_type: DateType;
  date_precision: DatePrecision;
};

export async function getExpiringLines(withinDays?: number): Promise<ExpiringLine[]> {
  const [db, soonDays] = await Promise.all([getDb(), withinDays === undefined ? getSoonDays() : Promise.resolve(withinDays)]);
  const limit = addDaysISO(soonDays, todayISO());
  return db.all<ExpiringLine>(
    `SELECT p.id AS product_id, p.name AS name, p.brand AS brand,
            p.image_url AS image_url, p.unit AS unit,
            l.id AS location_id, l.name AS location_name, l.emoji AS location_emoji,
            SUM(s.quantity) AS quantity, COUNT(s.id) AS entry_count,
            s.expiry_date AS expiry_date, s.expiry_date AS next_expiry,
            s.date_type AS date_type, s.date_type AS next_date_type,
            s.date_precision AS date_precision, s.date_precision AS next_date_precision,
            MAX(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS any_opened
       FROM stock_entries s
       JOIN products p ON p.id = s.product_id
       JOIN locations l ON l.id = s.location_id
      WHERE s.quantity > 0 AND s.expiry_date IS NOT NULL AND s.expiry_date <= ?
      GROUP BY p.id, l.id, s.expiry_date, s.date_type, s.date_precision
      ORDER BY s.expiry_date, LOWER(p.name)`,
    limit,
  );
}

export async function getKitchenTotals(): Promise<{
  products: number;
  units: number;
  expired: number;
  soon: number;
}> {
  const [db, soonDays] = await Promise.all([getDb(), getSoonDays()]);
  const today = todayISO();
  const soon = addDaysISO(soonDays, today);
  return (await db.get<{
    products: number;
    units: number;
    expired: number;
    soon: number;
  }>(
    `SELECT COUNT(DISTINCT product_id) AS products, COALESCE(SUM(quantity), 0) AS units,
            COUNT(CASE WHEN expiry_date < ? THEN 1 END) AS expired,
            COUNT(CASE WHEN expiry_date >= ? AND expiry_date <= ? THEN 1 END) AS soon
       FROM stock_entries WHERE quantity > 0`,
    today,
    today,
    soon,
  )) ?? { products: 0, units: 0, expired: 0, soon: 0 };
}

export async function getProduct(id: number): Promise<Product | undefined> {
  const db = await getDb();
  return db.get<Product>("SELECT * FROM products WHERE id = ?", id);
}

export async function getProductByBarcode(barcode: string): Promise<Product | undefined> {
  const db = await getDb();
  return db.get<Product>("SELECT * FROM products WHERE barcode = ?", barcode);
}

export async function getEntriesForProduct(productId: number): Promise<StockEntryDetail[]> {
  const db = await getDb();
  return db.all<StockEntryDetail>(
    `SELECT s.*, l.name AS location_name, l.emoji AS location_emoji
       FROM stock_entries s JOIN locations l ON l.id = s.location_id
      WHERE s.product_id = ? AND s.quantity > 0
      ORDER BY (s.expiry_date IS NULL), s.expiry_date, s.id`,
    productId,
  );
}

export async function getAllProducts(): Promise<Product[]> {
  const db = await getDb();
  return db.all<Product>("SELECT * FROM products ORDER BY LOWER(name)");
}

export async function getLowStock(): Promise<Array<{
  id: number;
  name: string;
  unit: string;
  min_stock: number;
  in_stock: number;
}>> {
  const db = await getDb();
  return db.all(
    `SELECT p.id, p.name, p.unit, p.min_stock,
            COALESCE((SELECT SUM(quantity) FROM stock_entries s WHERE s.product_id = p.id), 0) AS in_stock
       FROM products p
      WHERE p.min_stock > 0
        AND COALESCE((SELECT SUM(quantity) FROM stock_entries s WHERE s.product_id = p.id), 0) <= p.min_stock
      ORDER BY LOWER(p.name)`,
  );
}

export async function getShoppingItems(): Promise<ShoppingItem[]> {
  const db = await getDb();
  return db.all<ShoppingItem>("SELECT * FROM shopping_items ORDER BY checked, created_at DESC");
}

export async function getActivity(limit = 25): Promise<Activity[]> {
  const db = await getDb();
  return db.all<Activity>("SELECT * FROM activity ORDER BY id DESC LIMIT ?", limit);
}
