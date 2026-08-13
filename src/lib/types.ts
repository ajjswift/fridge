export type ExpiryStatus = "expired" | "soon" | "fresh" | "none";

/**
 * "Use by" is about safety — don't eat it after. "Best before" is about
 * quality — usually fine, may not taste its best. Worth keeping apart: it's
 * the difference between binning something and having it for lunch.
 */
export type DateType = "best_before" | "use_by";

/** Some packets only print a month, so don't invent a day that isn't there. */
export type DatePrecision = "day" | "month";

export const DATE_TYPE_LABEL: Record<DateType, string> = {
  best_before: "Best before",
  use_by: "Use by",
};

export const DATE_TYPE_HELP: Record<DateType, string> = {
  best_before: "About quality. Usually still fine after this date — have a look and a sniff.",
  use_by: "About safety. Don't eat it after this date, even if it looks fine.",
};

export type Location = {
  id: number;
  name: string;
  emoji: string;
  description: string | null;
  is_freezer: number;
  sort_order: number;
};

export type LocationSummary = Location & {
  product_count: number;
  total_quantity: number;
  expired_count: number;
  soon_count: number;
};

export type Product = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  image_url: string | null;
  category: string | null;
  unit: string;
  default_location_id: number | null;
  default_expiry_days: number | null;
  default_date_type: DateType | null;
  min_stock: number;
};

export type StockEntry = {
  id: number;
  product_id: number;
  location_id: number;
  quantity: number;
  expiry_date: string | null;
  date_type: DateType;
  date_precision: DatePrecision;
  opened_at: string | null;
  purchased_at: string | null;
  note: string | null;
  created_at: string;
};

/** A product rolled up across every entry in one location (what a list row shows). */
export type StockLine = {
  product_id: number;
  name: string;
  brand: string | null;
  image_url: string | null;
  unit: string;
  location_id: number;
  location_name: string;
  location_emoji: string;
  quantity: number;
  entry_count: number;
  next_expiry: string | null;
  next_date_type: DateType;
  next_date_precision: DatePrecision;
  any_opened: number;
};

/** A single dated batch, shown on the product screen. */
export type StockEntryDetail = StockEntry & {
  location_name: string;
  location_emoji: string;
};

export type ShoppingItem = {
  id: number;
  product_id: number | null;
  name: string;
  quantity: number;
  unit: string | null;
  checked: number;
  created_at: string;
};

export type Activity = {
  id: number;
  kind: string;
  product_id: number | null;
  product_name: string;
  location_name: string | null;
  quantity: number | null;
  unit: string | null;
  created_at: string;
};

export const UNITS = [
  "item",
  "pack",
  "bottle",
  "can",
  "jar",
  "bag",
  "box",
  "g",
  "kg",
  "ml",
  "L",
] as const;

export const DEFAULT_UNIT = "item";
