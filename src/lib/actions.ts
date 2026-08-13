"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "./auth";
import { getDb } from "./db";
import type { DatabaseAdapter } from "./db-adapter";
import { endOfMonthISO, todayISO } from "./dates";
import type { DatePrecision, DateType, Location, Product } from "./types";
import { DEFAULT_UNIT } from "./types";

function refresh() { revalidatePath("/", "layout"); }
async function requireSignedIn(): Promise<{ ok: false; error: string } | null> {
  return (await currentUser()) ? null : { ok: false, error: "You've been signed out. Sign in again to make changes." };
}
async function logActivity(db: DatabaseAdapter, entry: {
  kind: string; productId: number | null; productName: string; locationName?: string | null;
  quantity?: number | null; unit?: string | null;
}) {
  await db.run(
    `INSERT INTO activity (kind, product_id, product_name, location_name, quantity, unit)
     VALUES (?, ?, ?, ?, ?, ?)`,
    entry.kind, entry.productId, entry.productName, entry.locationName ?? null,
    entry.quantity ?? null, entry.unit ?? null,
  );
}
function messageFor(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.includes("products_barcode_key") || raw.includes("products.barcode")
    ? "That barcode is already used by another product." : raw;
}
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const nullableString = z.string().trim().max(200).optional().nullable().transform((value) => value || null);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().transform((value) => value || null);
const AddStockInput = z.object({
  productId: z.number().int().positive().optional().nullable(), name: z.string().trim().min(1, "Give it a name").max(120),
  brand: nullableString, barcode: nullableString, imageUrl: nullableString, category: nullableString,
  unit: z.string().trim().min(1).max(20).default(DEFAULT_UNIT), locationId: z.number().int().positive(),
  quantity: z.number().positive().max(100000), expiryDate: isoDate,
  dateType: z.enum(["best_before", "use_by"]).default("best_before"), datePrecision: z.enum(["day", "month"]).default("day"),
  note: nullableString, minStock: z.number().min(0).max(10000).optional().nullable(), rememberDefaults: z.boolean().default(true),
});
export type AddStockValues = z.input<typeof AddStockInput>;

export async function addStock(raw: AddStockValues): Promise<ActionResult<{ productId: number; productName: string }>> {
  const denied = await requireSignedIn(); if (denied) return denied;
  const parsed = AddStockInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const value = parsed.data;
  try {
    const result = await (await getDb()).transaction(async (db) => {
      let product = value.productId ? await db.get<Product>("SELECT * FROM products WHERE id = ?", value.productId) : undefined;
      if (!product && value.barcode) product = await db.get<Product>("SELECT * FROM products WHERE barcode = ?", value.barcode);
      if (!product) {
        product = await db.get<Product>(
          `INSERT INTO products (name, brand, barcode, image_url, category, unit, default_location_id, default_date_type, min_stock)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
          value.name, value.brand, value.barcode, value.imageUrl, value.category, value.unit, value.locationId,
          value.expiryDate ? value.dateType : null, value.minStock ?? 0,
        );
        if (!product) throw new Error("Couldn't create that product.");
      } else if (value.rememberDefaults) {
        await db.run(
          `UPDATE products SET name = ?, brand = ?, unit = ?, image_url = COALESCE(?, image_url),
             default_location_id = ?, default_date_type = COALESCE(?, default_date_type), min_stock = COALESCE(?, min_stock)
           WHERE id = ?`,
          value.name, value.brand, value.unit, value.imageUrl, value.locationId,
          value.expiryDate ? value.dateType : null, value.minStock, product.id,
        );
        product = { ...product, name: value.name, unit: value.unit };
      }
      const existing = await db.get<{ id: number }>(
        `SELECT id FROM stock_entries WHERE product_id = ? AND location_id = ? AND opened_at IS NULL
           AND COALESCE(expiry_date, '') = COALESCE(?, '') AND date_type = ?`,
        product.id, value.locationId, value.expiryDate, value.dateType,
      );
      if (existing) await db.run("UPDATE stock_entries SET quantity = quantity + ? WHERE id = ?", value.quantity, existing.id);
      else await db.run(
        `INSERT INTO stock_entries (product_id, location_id, quantity, expiry_date, date_type, date_precision, purchased_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, product.id, value.locationId, value.quantity, value.expiryDate,
        value.dateType, value.datePrecision, todayISO(), value.note,
      );
      const location = await db.get<{ name: string }>("SELECT name FROM locations WHERE id = ?", value.locationId);
      await logActivity(db, { kind: "add", productId: product.id, productName: product.name, locationName: location?.name, quantity: value.quantity, unit: value.unit });
      await db.run("DELETE FROM shopping_items WHERE product_id = ? OR LOWER(name) = LOWER(?)", product.id, value.name);
      return { productId: product.id, productName: product.name };
    });
    refresh(); return { ok: true, data: result };
  } catch (error) { return { ok: false, error: messageFor(error) }; }
}

export async function consumeStock(input: { productId: number; locationId?: number | null; quantity: number; waste?: boolean }): Promise<ActionResult<{ removed: number }>> {
  const denied = await requireSignedIn(); if (denied) return denied;
  const wanted = Number(input.quantity); if (!Number.isFinite(wanted) || wanted <= 0) return { ok: false, error: "Quantity must be more than zero" };
  try {
    const removed = await (await getDb()).transaction(async (db) => {
      const entries = await db.all<{ id: number; quantity: number }>(
        `SELECT id, quantity FROM stock_entries WHERE product_id = ? AND quantity > 0
          AND (? IS NULL OR location_id = ?) ORDER BY (expiry_date IS NULL), expiry_date, id`,
        input.productId, input.locationId ?? null, input.locationId ?? null,
      );
      let left = wanted;
      for (const entry of entries) {
        if (left <= 0) break;
        const take = Math.min(entry.quantity, left);
        if (entry.quantity - take > 0.0001) await db.run("UPDATE stock_entries SET quantity = ? WHERE id = ?", entry.quantity - take, entry.id);
        else await db.run("DELETE FROM stock_entries WHERE id = ?", entry.id);
        left -= take;
      }
      const took = wanted - left;
      if (took > 0) {
        const product = await db.get<{ name: string; unit: string }>("SELECT name, unit FROM products WHERE id = ?", input.productId);
        const location = input.locationId ? await db.get<{ name: string }>("SELECT name FROM locations WHERE id = ?", input.locationId) : undefined;
        await logActivity(db, { kind: input.waste ? "waste" : "consume", productId: input.productId, productName: product?.name ?? "Item", locationName: location?.name, quantity: took, unit: product?.unit });
      }
      return took;
    });
    refresh(); return { ok: true, data: { removed } };
  } catch (error) { return { ok: false, error: messageFor(error) }; }
}

export async function consumeEntry(input: { entryId: number; quantity: number; waste?: boolean }): Promise<ActionResult> {
  const denied = await requireSignedIn(); if (denied) return denied;
  try {
    await (await getDb()).transaction(async (db) => {
      const entry = await db.get<{ id: number; product_id: number; quantity: number; product_name: string; unit: string; location_name: string }>(
        `SELECT s.*, p.name AS product_name, p.unit, l.name AS location_name FROM stock_entries s
         JOIN products p ON p.id = s.product_id JOIN locations l ON l.id = s.location_id WHERE s.id = ?`, input.entryId,
      );
      if (!entry) throw new Error("That item is no longer there.");
      const take = Math.min(entry.quantity, Math.max(0, input.quantity));
      if (entry.quantity - take > 0.0001) await db.run("UPDATE stock_entries SET quantity = ? WHERE id = ?", entry.quantity - take, entry.id);
      else await db.run("DELETE FROM stock_entries WHERE id = ?", entry.id);
      await logActivity(db, { kind: input.waste ? "waste" : "consume", productId: entry.product_id, productName: entry.product_name, locationName: entry.location_name, quantity: take, unit: entry.unit });
    });
    refresh(); return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: messageFor(error) }; }
}

export async function setEntryOpened(input: { entryId: number; opened: boolean }): Promise<ActionResult> {
  const denied = await requireSignedIn(); if (denied) return denied;
  try { await (await getDb()).run("UPDATE stock_entries SET opened_at = ? WHERE id = ?", input.opened ? todayISO() : null, input.entryId); refresh(); return { ok: true, data: undefined }; }
  catch (error) { return { ok: false, error: messageFor(error) }; }
}
export async function updateEntry(input: { entryId: number; quantity?: number; expiryDate?: string | null; dateType?: "best_before" | "use_by"; datePrecision?: "day" | "month"; locationId?: number; note?: string | null }): Promise<ActionResult> {
  const denied = await requireSignedIn(); if (denied) return denied;
  try {
    await (await getDb()).transaction(async (db) => {
      const entry = await db.get<{ id: number; product_id: number }>("SELECT id, product_id FROM stock_entries WHERE id = ?", input.entryId);
      if (!entry) throw new Error("That item is no longer there.");
      if (input.quantity !== undefined) {
        if (input.quantity <= 0) { await db.run("DELETE FROM stock_entries WHERE id = ?", entry.id); return; }
        await db.run("UPDATE stock_entries SET quantity = ? WHERE id = ?", input.quantity, entry.id);
      }
      if (input.expiryDate !== undefined) await db.run("UPDATE stock_entries SET expiry_date = ? WHERE id = ?", input.expiryDate || null, entry.id);
      if (input.dateType !== undefined) await db.run("UPDATE stock_entries SET date_type = ? WHERE id = ?", input.dateType, entry.id);
      if (input.datePrecision !== undefined) await db.run("UPDATE stock_entries SET date_precision = ? WHERE id = ?", input.datePrecision, entry.id);
      if (input.locationId !== undefined) {
        await db.run("UPDATE stock_entries SET location_id = ? WHERE id = ?", input.locationId, entry.id);
        const [product, location] = await Promise.all([
          db.get<{ name: string }>("SELECT name FROM products WHERE id = ?", entry.product_id),
          db.get<{ name: string }>("SELECT name FROM locations WHERE id = ?", input.locationId),
        ]);
        await logActivity(db, { kind: "move", productId: entry.product_id, productName: product?.name ?? "Item", locationName: location?.name });
      }
      if (input.note !== undefined) await db.run("UPDATE stock_entries SET note = ? WHERE id = ?", input.note || null, entry.id);
    });
    refresh(); return { ok: true, data: undefined };
  } catch (error) { return { ok: false, error: messageFor(error) }; }
}
export async function deleteEntry(entryId: number): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run("DELETE FROM stock_entries WHERE id = ?", entryId); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }

const ProductInput = z.object({ id: z.number().int().positive(), name: z.string().trim().min(1).max(120), brand: nullableString, barcode: nullableString, unit: z.string().trim().min(1).max(20), defaultLocationId: z.number().int().positive().nullable().optional(), defaultDateType: z.enum(["best_before", "use_by"]).nullable().optional(), minStock: z.number().min(0).max(10000).default(0) });
export async function updateProduct(raw: z.input<typeof ProductInput>): Promise<ActionResult> {
  const denied = await requireSignedIn(); if (denied) return denied; const parsed = ProductInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const value = parsed.data;
  try { await (await getDb()).run(`UPDATE products SET name = ?, brand = ?, barcode = ?, unit = ?, default_location_id = ?, default_date_type = ?, min_stock = ? WHERE id = ?`, value.name, value.brand, value.barcode, value.unit, value.defaultLocationId ?? null, value.defaultDateType ?? null, value.minStock, value.id); refresh(); return { ok: true, data: undefined }; }
  catch (error) { return { ok: false, error: messageFor(error) }; }
}
export async function deleteProduct(id: number): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run("DELETE FROM products WHERE id = ?", id); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }

const LocationInput = z.object({ name: z.string().trim().min(1, "Give the place a name").max(40), emoji: z.string().trim().min(1).max(8).default("📦"), description: nullableString, isFreezer: z.boolean().default(false) });
export async function createLocation(raw: z.input<typeof LocationInput>): Promise<ActionResult<{ id: number }>> {
  const denied = await requireSignedIn(); if (denied) return denied; const parsed = LocationInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }; const value = parsed.data;
  try {
    const id = await (await getDb()).transaction(async (db) => {
      const max = await db.get<{ m: number }>("SELECT COALESCE(MAX(sort_order), 0) AS m FROM locations");
      const row = await db.get<{ id: number }>(`INSERT INTO locations (name, emoji, description, is_freezer, sort_order) VALUES (?, ?, ?, ?, ?) RETURNING id`, value.name, value.emoji, value.description, value.isFreezer ? 1 : 0, (max?.m ?? 0) + 1);
      if (!row) throw new Error("Couldn't create that place."); return row.id;
    }); refresh(); return { ok: true, data: { id } };
  } catch (error) { return { ok: false, error: messageFor(error) }; }
}
export async function updateLocation(raw: z.input<typeof LocationInput> & { id: number }): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; const parsed = LocationInput.safeParse(raw); if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }; const value = parsed.data; try { await (await getDb()).run("UPDATE locations SET name = ?, emoji = ?, description = ?, is_freezer = ? WHERE id = ?", value.name, value.emoji, value.description, value.isFreezer ? 1 : 0, raw.id); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function deleteLocation(id: number): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { const db = await getDb(); const count = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM stock_entries WHERE location_id = ?", id); if ((count?.n ?? 0) > 0) return { ok: false, error: "Empty this place first — it still has things in it." }; await db.run("DELETE FROM locations WHERE id = ?", id); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function reorderLocations(ids: number[]): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).transaction(async (db) => { for (const [index, id] of ids.entries()) await db.run("UPDATE locations SET sort_order = ? WHERE id = ?", index, id); }); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }

export async function addShoppingItem(input: { name: string; quantity?: number; unit?: string | null; productId?: number | null }): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; const name = input.name.trim(); if (!name) return { ok: false, error: "Type something to add" }; try { await (await getDb()).run("INSERT INTO shopping_items (product_id, name, quantity, unit) VALUES (?, ?, ?, ?)", input.productId ?? null, name, input.quantity ?? 1, input.unit ?? null); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function toggleShoppingItem(input: { id: number; checked: boolean }): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run("UPDATE shopping_items SET checked = ? WHERE id = ?", input.checked ? 1 : 0, input.id); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function deleteShoppingItem(id: number): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run("DELETE FROM shopping_items WHERE id = ?", id); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function clearCheckedShoppingItems(): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run("DELETE FROM shopping_items WHERE checked = 1"); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function addLowStockToShoppingList(): Promise<ActionResult<{ added: number }>> { const denied = await requireSignedIn(); if (denied) return denied; try { const added = await (await getDb()).transaction(async (db) => { const low = await db.all<{ id: number; name: string; unit: string; min_stock: number; in_stock: number }>(`SELECT p.id, p.name, p.unit, p.min_stock, COALESCE((SELECT SUM(quantity) FROM stock_entries s WHERE s.product_id = p.id), 0) AS in_stock FROM products p WHERE p.min_stock > 0 AND COALESCE((SELECT SUM(quantity) FROM stock_entries s WHERE s.product_id = p.id), 0) <= p.min_stock`); let total = 0; for (const item of low) { if (await db.get("SELECT id FROM shopping_items WHERE product_id = ? AND checked = 0", item.id)) continue; await db.run("INSERT INTO shopping_items (product_id, name, quantity, unit) VALUES (?, ?, ?, ?)", item.id, item.name, Math.max(1, Math.ceil(item.min_stock - item.in_stock)), item.unit); total += 1; } return total; }); refresh(); return { ok: true, data: { added } }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function setSetting(key: string, value: string): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }

type SampleItem = { name: string; brand: string | null; unit: string; days: number; location: number; type: DateType; precision?: DatePrecision };
const SAMPLE: SampleItem[] = [
  { name: "Semi-skimmed milk", brand: "Tesco", unit: "bottle", days: 3, location: 0, type: "use_by" }, { name: "Cheddar cheese", brand: "Cathedral City", unit: "pack", days: 14, location: 0, type: "use_by" }, { name: "Greek yoghurt", brand: "Fage", unit: "pack", days: 1, location: 0, type: "use_by" }, { name: "Eggs", brand: "Happy Egg Co", unit: "pack", days: 9, location: 0, type: "best_before" }, { name: "Chicken breasts", brand: null, unit: "pack", days: -1, location: 0, type: "use_by" }, { name: "Butter", brand: "Lurpak", unit: "pack", days: 30, location: 0, type: "best_before" }, { name: "Peas", brand: "Birds Eye", unit: "bag", days: 240, location: 1, type: "best_before", precision: "month" }, { name: "Fish fingers", brand: "Birds Eye", unit: "pack", days: 180, location: 1, type: "best_before", precision: "month" }, { name: "Chopped tomatoes", brand: "Napolina", unit: "can", days: 400, location: 2, type: "best_before", precision: "month" }, { name: "Penne pasta", brand: "Barilla", unit: "pack", days: 300, location: 2, type: "best_before", precision: "month" }, { name: "Basmati rice", brand: "Tilda", unit: "bag", days: 260, location: 2, type: "best_before", precision: "month" }, { name: "Baked beans", brand: "Heinz", unit: "can", days: 500, location: 2, type: "best_before", precision: "month" }, { name: "Cornflakes", brand: "Kellogg's", unit: "pack", days: 60, location: 3, type: "best_before", precision: "month" }, { name: "Sourdough loaf", brand: null, unit: "item", days: 2, location: 3, type: "best_before" }, { name: "Digestives", brand: "McVitie's", unit: "pack", days: 90, location: 3, type: "best_before", precision: "month" }, { name: "Bananas", brand: null, unit: "item", days: 4, location: 4, type: "best_before" }, { name: "Spinach", brand: null, unit: "bag", days: 2, location: 4, type: "use_by" }, { name: "Carrots", brand: null, unit: "bag", days: 11, location: 4, type: "best_before" }, { name: "Orange juice", brand: "Tropicana", unit: "bottle", days: 6, location: 5, type: "use_by" }, { name: "Sparkling water", brand: "Highland Spring", unit: "bottle", days: 300, location: 5, type: "best_before", precision: "month" },
];
export async function loadSampleData(): Promise<ActionResult<{ added: number }>> { const denied = await requireSignedIn(); if (denied) return denied; try { const added = await (await getDb()).transaction(async (db) => { const locations = await db.all<Location>("SELECT * FROM locations ORDER BY sort_order, LOWER(name)"); if (!locations.length) throw new Error("Add a storage place first."); let total = 0; for (const item of SAMPLE) { const location = locations[Math.min(item.location, locations.length - 1)]; const existing = await db.get<{ id: number }>("SELECT id FROM products WHERE LOWER(name) = LOWER(?)", item.name); const productId = existing?.id ?? (await db.get<{ id: number }>(`INSERT INTO products (name, brand, unit, default_location_id, default_date_type) VALUES (?, ?, ?, ?, ?) RETURNING id`, item.name, item.brand, item.unit, location.id, item.type))?.id; if (!productId) throw new Error("Couldn't create sample product."); const date = new Date(); date.setDate(date.getDate() + item.days); const precision = item.precision ?? "day"; const expiry = precision === "month" ? endOfMonthISO(todayISO(date)) : todayISO(date); await db.run(`INSERT INTO stock_entries (product_id, location_id, quantity, expiry_date, date_type, date_precision, purchased_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, productId, location.id, 1 + Math.floor(Math.random() * 3), expiry, item.type, precision, todayISO()); total += 1; } return total; }); refresh(); return { ok: true, data: { added } }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
export async function clearAllStock(): Promise<ActionResult> { const denied = await requireSignedIn(); if (denied) return denied; try { await (await getDb()).transaction(async (db) => { await db.run("DELETE FROM stock_entries"); await db.run("DELETE FROM activity"); }); refresh(); return { ok: true, data: undefined }; } catch (error) { return { ok: false, error: messageFor(error) }; } }
