import "server-only";
import { db } from "./db";
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

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function getSoonDays(): number {
  const n = Number(getSetting("expiry_soon_days", "5"));
  return Number.isFinite(n) && n > 0 ? n : 5;
}

export function getLocations(): Location[] {
  return db
    .prepare("SELECT * FROM locations ORDER BY sort_order, name")
    .all() as Location[];
}

export function getLocation(id: number): Location | undefined {
  return db.prepare("SELECT * FROM locations WHERE id = ?").get(id) as
    | Location
    | undefined;
}

export function getLocationSummaries(): LocationSummary[] {
  const today = todayISO();
  const soon = addDaysISO(getSoonDays(), today);
  return db
    .prepare(
      `SELECT l.*,
              COUNT(DISTINCT s.product_id)                              AS product_count,
              COALESCE(SUM(s.quantity), 0)                              AS total_quantity,
              COUNT(DISTINCT CASE WHEN s.expiry_date <  @today
                                  THEN s.id END)                        AS expired_count,
              COUNT(DISTINCT CASE WHEN s.expiry_date >= @today
                                   AND s.expiry_date <= @soon
                                  THEN s.id END)                        AS soon_count
         FROM locations l
         LEFT JOIN stock_entries s
                ON s.location_id = l.id AND s.quantity > 0
        GROUP BY l.id
        ORDER BY l.sort_order, l.name`,
    )
    .all({ today, soon }) as LocationSummary[];
}

const STOCK_LINE_SELECT = `
  SELECT p.id            AS product_id,
         p.name          AS name,
         p.brand         AS brand,
         p.image_url     AS image_url,
         p.unit          AS unit,
         l.id            AS location_id,
         l.name          AS location_name,
         l.emoji         AS location_emoji,
         SUM(s.quantity) AS quantity,
         COUNT(s.id)     AS entry_count,
         MIN(s.expiry_date) AS next_expiry,
         -- The type and precision belong to whichever batch runs out first,
         -- which is the one the row's date is showing.
         (SELECT s2.date_type FROM stock_entries s2
           WHERE s2.product_id = p.id AND s2.location_id = l.id AND s2.quantity > 0
           ORDER BY (s2.expiry_date IS NULL), s2.expiry_date LIMIT 1) AS next_date_type,
         (SELECT s2.date_precision FROM stock_entries s2
           WHERE s2.product_id = p.id AND s2.location_id = l.id AND s2.quantity > 0
           ORDER BY (s2.expiry_date IS NULL), s2.expiry_date LIMIT 1) AS next_date_precision,
         MAX(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS any_opened
    FROM stock_entries s
    JOIN products  p ON p.id = s.product_id
    JOIN locations l ON l.id = s.location_id
   WHERE s.quantity > 0`;

/** Everything in one location, one row per product. */
export function getStockLinesByLocation(locationId: number): StockLine[] {
  return db
    .prepare(
      `${STOCK_LINE_SELECT} AND s.location_id = ?
        GROUP BY p.id, l.id
        ORDER BY (MIN(s.expiry_date) IS NULL), MIN(s.expiry_date), p.name COLLATE NOCASE`,
    )
    .all(locationId) as StockLine[];
}

export function searchStockLines(query: string): StockLine[] {
  const q = `%${query.trim()}%`;
  return db
    .prepare(
      `${STOCK_LINE_SELECT}
         AND (p.name LIKE @q OR p.brand LIKE @q OR p.barcode LIKE @q)
        GROUP BY p.id, l.id
        ORDER BY p.name COLLATE NOCASE
        LIMIT 60`,
    )
    .all({ q }) as StockLine[];
}

export type ExpiringLine = StockLine & {
  expiry_date: string;
  date_type: DateType;
  date_precision: DatePrecision;
};

/**
 * One row per dated batch, so a product with two different dates shows twice —
 * which is what you want when you're deciding what to cook tonight.
 */
export function getExpiringLines(withinDays?: number): ExpiringLine[] {
  const today = todayISO();
  const limit = addDaysISO(withinDays ?? getSoonDays(), today);
  // Grouped per dated batch rather than per product, so this query reads the
  // batch's own type and precision instead of the earliest batch's.
  return db
    .prepare(
      `SELECT p.id            AS product_id,
              p.name          AS name,
              p.brand         AS brand,
              p.image_url     AS image_url,
              p.unit          AS unit,
              l.id            AS location_id,
              l.name          AS location_name,
              l.emoji         AS location_emoji,
              SUM(s.quantity) AS quantity,
              COUNT(s.id)     AS entry_count,
              s.expiry_date   AS expiry_date,
              s.expiry_date   AS next_expiry,
              s.date_type     AS date_type,
              s.date_type     AS next_date_type,
              s.date_precision AS date_precision,
              s.date_precision AS next_date_precision,
              MAX(CASE WHEN s.opened_at IS NOT NULL THEN 1 ELSE 0 END) AS any_opened
         FROM stock_entries s
         JOIN products  p ON p.id = s.product_id
         JOIN locations l ON l.id = s.location_id
        WHERE s.quantity > 0
          AND s.expiry_date IS NOT NULL
          AND s.expiry_date <= @limit
        GROUP BY p.id, l.id, s.expiry_date, s.date_type, s.date_precision
        ORDER BY s.expiry_date, p.name COLLATE NOCASE`,
    )
    .all({ limit }) as ExpiringLine[];
}

export function getKitchenTotals() {
  const today = todayISO();
  const soon = addDaysISO(getSoonDays(), today);
  return db
    .prepare(
      `SELECT COUNT(DISTINCT product_id) AS products,
              COALESCE(SUM(quantity), 0) AS units,
              COUNT(CASE WHEN expiry_date <  @today THEN 1 END) AS expired,
              COUNT(CASE WHEN expiry_date >= @today
                          AND expiry_date <= @soon THEN 1 END)  AS soon
         FROM stock_entries
        WHERE quantity > 0`,
    )
    .get({ today, soon }) as {
    products: number;
    units: number;
    expired: number;
    soon: number;
  };
}

export function getProduct(id: number): Product | undefined {
  return db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
    | Product
    | undefined;
}

export function getProductByBarcode(barcode: string): Product | undefined {
  return db.prepare("SELECT * FROM products WHERE barcode = ?").get(barcode) as
    | Product
    | undefined;
}

export function getEntriesForProduct(productId: number): StockEntryDetail[] {
  return db
    .prepare(
      `SELECT s.*, l.name AS location_name, l.emoji AS location_emoji
         FROM stock_entries s
         JOIN locations l ON l.id = s.location_id
        WHERE s.product_id = ? AND s.quantity > 0
        ORDER BY (s.expiry_date IS NULL), s.expiry_date, s.id`,
    )
    .all(productId) as StockEntryDetail[];
}

export function getAllProducts(): Product[] {
  return db
    .prepare("SELECT * FROM products ORDER BY name COLLATE NOCASE")
    .all() as Product[];
}

/** Products whose total stock has dropped to or below their minimum. */
export function getLowStock() {
  return db
    .prepare(
      `SELECT p.id, p.name, p.unit, p.min_stock,
              COALESCE((SELECT SUM(quantity) FROM stock_entries s
                         WHERE s.product_id = p.id), 0) AS in_stock
         FROM products p
        WHERE p.min_stock > 0
          AND COALESCE((SELECT SUM(quantity) FROM stock_entries s
                         WHERE s.product_id = p.id), 0) <= p.min_stock
        ORDER BY p.name COLLATE NOCASE`,
    )
    .all() as Array<{
    id: number;
    name: string;
    unit: string;
    min_stock: number;
    in_stock: number;
  }>;
}

export function getShoppingItems(): ShoppingItem[] {
  return db
    .prepare(
      "SELECT * FROM shopping_items ORDER BY checked, created_at DESC",
    )
    .all() as ShoppingItem[];
}

export function getActivity(limit = 25): Activity[] {
  return db
    .prepare("SELECT * FROM activity ORDER BY id DESC LIMIT ?")
    .all(limit) as Activity[];
}
