"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "./db";
import { endOfMonthISO, todayISO } from "./dates";
import { currentUser } from "./auth";
import type { DatePrecision, DateType, Location, Product } from "./types";
import { DEFAULT_UNIT } from "./types";

/**
 * Every screen reads from SQLite on each request, so after a write we simply
 * invalidate the whole tree. It's a single-household app — correctness over
 * micro-optimised cache keys.
 */
function refresh() {
  revalidatePath("/", "layout");
}

/**
 * Guards every mutation. Server actions are reachable over HTTP regardless of
 * what the UI renders, so the layout's session check is not enough on its own.
 */
async function requireSignedIn(): Promise<{ ok: false; error: string } | null> {
  const user = await currentUser();
  if (user) return null;
  return {
    ok: false,
    error: "You've been signed out. Sign in again to make changes.",
  };
}

function logActivity(entry: {
  kind: string;
  productId: number | null;
  productName: string;
  locationName?: string | null;
  quantity?: number | null;
  unit?: string | null;
}) {
  db.prepare(
    `INSERT INTO activity (kind, product_id, product_name, location_name, quantity, unit)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.kind,
    entry.productId,
    entry.productName,
    entry.locationName ?? null,
    entry.quantity ?? null,
    entry.unit ?? null,
  );
}

const nullableString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

/* ------------------------------------------------------------------ stock -- */

const AddStockInput = z.object({
  productId: z.number().int().positive().optional().nullable(),
  name: z.string().trim().min(1, "Give it a name").max(120),
  brand: nullableString,
  barcode: nullableString,
  imageUrl: nullableString,
  category: nullableString,
  unit: z.string().trim().min(1).max(20).default(DEFAULT_UNIT),
  locationId: z.number().int().positive(),
  quantity: z.number().positive().max(100000),
  expiryDate: isoDate,
  dateType: z.enum(["best_before", "use_by"]).default("best_before"),
  datePrecision: z.enum(["day", "month"]).default("day"),
  note: nullableString,
  minStock: z.number().min(0).max(10000).optional().nullable(),
  rememberDefaults: z.boolean().default(true),
});

export type AddStockValues = z.input<typeof AddStockInput>;

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * The workhorse behind the scanner: finds or creates the product, then files a
 * dated batch into a location.
 */
export async function addStock(
  raw: AddStockValues,
): Promise<ActionResult<{ productId: number; productName: string }>> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const parsed = AddStockInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;

  try {
    const result = db.transaction(() => {
      let product: Product | undefined;

      if (v.productId) {
        product = db.prepare("SELECT * FROM products WHERE id = ?").get(v.productId) as
          | Product
          | undefined;
      }
      if (!product && v.barcode) {
        product = db
          .prepare("SELECT * FROM products WHERE barcode = ?")
          .get(v.barcode) as Product | undefined;
      }

      if (!product) {
        const info = db
          .prepare(
            `INSERT INTO products
               (name, brand, barcode, image_url, category, unit,
                default_location_id, default_date_type, min_stock)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            v.name,
            v.brand,
            v.barcode,
            v.imageUrl,
            v.category,
            v.unit,
            v.locationId,
            v.expiryDate ? v.dateType : null,
            v.minStock ?? 0,
          );
        product = db
          .prepare("SELECT * FROM products WHERE id = ?")
          .get(info.lastInsertRowid as number) as Product;
      } else if (v.rememberDefaults) {
        // Remember where it lives and whether it carries a use-by or a best
        // before — both are properties of the product. Deliberately NOT how
        // long it lasts: the same milk can have a week or a month left
        // depending on what was on the shelf, so that gets asked every time.
        db.prepare(
          `UPDATE products
              SET name = ?, brand = ?, unit = ?, image_url = COALESCE(?, image_url),
                  default_location_id = ?,
                  default_date_type = COALESCE(?, default_date_type),
                  min_stock = COALESCE(?, min_stock)
            WHERE id = ?`,
        ).run(
          v.name,
          v.brand,
          v.unit,
          v.imageUrl,
          v.locationId,
          v.expiryDate ? v.dateType : null,
          v.minStock ?? null,
          product.id,
        );
      }

      // Merge into an identical batch rather than piling up duplicate rows.
      const existing = db
        .prepare(
          `SELECT id FROM stock_entries
            WHERE product_id = ? AND location_id = ? AND opened_at IS NULL
              AND IFNULL(expiry_date, '') = IFNULL(?, '')
              AND date_type = ?`,
        )
        .get(product.id, v.locationId, v.expiryDate, v.dateType) as
        | { id: number }
        | undefined;

      if (existing) {
        db.prepare("UPDATE stock_entries SET quantity = quantity + ? WHERE id = ?").run(
          v.quantity,
          existing.id,
        );
      } else {
        db.prepare(
          `INSERT INTO stock_entries
             (product_id, location_id, quantity, expiry_date, date_type,
              date_precision, purchased_at, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          product.id,
          v.locationId,
          v.quantity,
          v.expiryDate,
          v.dateType,
          v.datePrecision,
          todayISO(),
          v.note,
        );
      }

      const location = db
        .prepare("SELECT name FROM locations WHERE id = ?")
        .get(v.locationId) as { name: string } | undefined;

      logActivity({
        kind: "add",
        productId: product.id,
        productName: product.name,
        locationName: location?.name ?? null,
        quantity: v.quantity,
        unit: v.unit,
      });

      // Scanning something in usually means it's no longer needed on the list.
      db.prepare(
        `DELETE FROM shopping_items
          WHERE product_id = ? OR LOWER(name) = LOWER(?)`,
      ).run(product.id, v.name);

      return { productId: product.id, productName: product.name };
    })();

    refresh();
    return { ok: true, data: result };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

function messageFor(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (raw.includes("UNIQUE constraint failed: products.barcode")) {
    return "That barcode is already used by another product.";
  }
  return raw;
}

/** Take stock out, oldest date first. `waste` records it as thrown away. */
export async function consumeStock(input: {
  productId: number;
  locationId?: number | null;
  quantity: number;
  waste?: boolean;
}): Promise<ActionResult<{ removed: number }>> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const { productId, locationId, waste } = input;
  const wanted = Number(input.quantity);
  if (!Number.isFinite(wanted) || wanted <= 0) {
    return { ok: false, error: "Quantity must be more than zero" };
  }

  try {
    const removed = db.transaction(() => {
      const entries = db
        .prepare(
          `SELECT id, quantity FROM stock_entries
            WHERE product_id = @productId AND quantity > 0
              AND (@locationId IS NULL OR location_id = @locationId)
            ORDER BY (expiry_date IS NULL), expiry_date, id`,
        )
        .all({ productId, locationId: locationId ?? null }) as Array<{
        id: number;
        quantity: number;
      }>;

      let left = wanted;
      for (const entry of entries) {
        if (left <= 0) break;
        const take = Math.min(entry.quantity, left);
        const remaining = entry.quantity - take;
        if (remaining > 0.0001) {
          db.prepare("UPDATE stock_entries SET quantity = ? WHERE id = ?").run(
            remaining,
            entry.id,
          );
        } else {
          db.prepare("DELETE FROM stock_entries WHERE id = ?").run(entry.id);
        }
        left -= take;
      }

      const took = wanted - left;
      if (took > 0) {
        const product = db
          .prepare("SELECT name, unit FROM products WHERE id = ?")
          .get(productId) as { name: string; unit: string } | undefined;
        const location = locationId
          ? (db.prepare("SELECT name FROM locations WHERE id = ?").get(locationId) as
              | { name: string }
              | undefined)
          : undefined;
        logActivity({
          kind: waste ? "waste" : "consume",
          productId,
          productName: product?.name ?? "Item",
          locationName: location?.name ?? null,
          quantity: took,
          unit: product?.unit ?? null,
        });
      }
      return took;
    })();

    refresh();
    return { ok: true, data: { removed } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function consumeEntry(input: {
  entryId: number;
  quantity: number;
  waste?: boolean;
}): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.transaction(() => {
      const entry = db
        .prepare(
          `SELECT s.*, p.name AS product_name, p.unit AS unit, l.name AS location_name
             FROM stock_entries s
             JOIN products p  ON p.id = s.product_id
             JOIN locations l ON l.id = s.location_id
            WHERE s.id = ?`,
        )
        .get(input.entryId) as
        | {
            id: number;
            product_id: number;
            quantity: number;
            product_name: string;
            unit: string;
            location_name: string;
          }
        | undefined;
      if (!entry) throw new Error("That item is no longer there.");

      const take = Math.min(entry.quantity, Math.max(0, input.quantity));
      const remaining = entry.quantity - take;
      if (remaining > 0.0001) {
        db.prepare("UPDATE stock_entries SET quantity = ? WHERE id = ?").run(
          remaining,
          entry.id,
        );
      } else {
        db.prepare("DELETE FROM stock_entries WHERE id = ?").run(entry.id);
      }

      logActivity({
        kind: input.waste ? "waste" : "consume",
        productId: entry.product_id,
        productName: entry.product_name,
        locationName: entry.location_name,
        quantity: take,
        unit: entry.unit,
      });
    })();
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function setEntryOpened(input: {
  entryId: number;
  opened: boolean;
}): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("UPDATE stock_entries SET opened_at = ? WHERE id = ?").run(
      input.opened ? todayISO() : null,
      input.entryId,
    );
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateEntry(input: {
  entryId: number;
  quantity?: number;
  expiryDate?: string | null;
  dateType?: "best_before" | "use_by";
  datePrecision?: "day" | "month";
  locationId?: number;
  note?: string | null;
}): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.transaction(() => {
      const entry = db
        .prepare("SELECT * FROM stock_entries WHERE id = ?")
        .get(input.entryId) as { id: number; product_id: number } | undefined;
      if (!entry) throw new Error("That item is no longer there.");

      if (input.quantity !== undefined) {
        if (input.quantity <= 0) {
          db.prepare("DELETE FROM stock_entries WHERE id = ?").run(entry.id);
          return;
        }
        db.prepare("UPDATE stock_entries SET quantity = ? WHERE id = ?").run(
          input.quantity,
          entry.id,
        );
      }
      if (input.expiryDate !== undefined) {
        db.prepare("UPDATE stock_entries SET expiry_date = ? WHERE id = ?").run(
          input.expiryDate || null,
          entry.id,
        );
      }
      if (input.dateType !== undefined) {
        db.prepare("UPDATE stock_entries SET date_type = ? WHERE id = ?").run(
          input.dateType,
          entry.id,
        );
      }
      if (input.datePrecision !== undefined) {
        db.prepare("UPDATE stock_entries SET date_precision = ? WHERE id = ?").run(
          input.datePrecision,
          entry.id,
        );
      }
      if (input.locationId !== undefined) {
        db.prepare("UPDATE stock_entries SET location_id = ? WHERE id = ?").run(
          input.locationId,
          entry.id,
        );
        const product = db
          .prepare("SELECT name FROM products WHERE id = ?")
          .get(entry.product_id) as { name: string } | undefined;
        const location = db
          .prepare("SELECT name FROM locations WHERE id = ?")
          .get(input.locationId) as { name: string } | undefined;
        logActivity({
          kind: "move",
          productId: entry.product_id,
          productName: product?.name ?? "Item",
          locationName: location?.name ?? null,
        });
      }
      if (input.note !== undefined) {
        db.prepare("UPDATE stock_entries SET note = ? WHERE id = ?").run(
          input.note || null,
          entry.id,
        );
      }
    })();
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteEntry(entryId: number): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("DELETE FROM stock_entries WHERE id = ?").run(entryId);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/* --------------------------------------------------------------- products -- */

const ProductInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).max(120),
  brand: nullableString,
  barcode: nullableString,
  unit: z.string().trim().min(1).max(20),
  defaultLocationId: z.number().int().positive().nullable().optional(),
  defaultDateType: z.enum(["best_before", "use_by"]).nullable().optional(),
  minStock: z.number().min(0).max(10000).default(0),
});

export async function updateProduct(
  raw: z.input<typeof ProductInput>,
): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const parsed = ProductInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    db.prepare(
      `UPDATE products
          SET name = ?, brand = ?, barcode = ?, unit = ?,
              default_location_id = ?, default_date_type = ?, min_stock = ?
        WHERE id = ?`,
    ).run(
      v.name,
      v.brand,
      v.barcode,
      v.unit,
      v.defaultLocationId ?? null,
      v.defaultDateType ?? null,
      v.minStock,
      v.id,
    );
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteProduct(id: number): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("DELETE FROM products WHERE id = ?").run(id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/* -------------------------------------------------------------- locations -- */

const LocationInput = z.object({
  name: z.string().trim().min(1, "Give the place a name").max(40),
  emoji: z.string().trim().min(1).max(8).default("📦"),
  description: nullableString,
  isFreezer: z.boolean().default(false),
});

export async function createLocation(
  raw: z.input<typeof LocationInput>,
): Promise<ActionResult<{ id: number }>> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const parsed = LocationInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    const max = db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS m FROM locations").get() as {
      m: number;
    };
    const info = db
      .prepare(
        `INSERT INTO locations (name, emoji, description, is_freezer, sort_order)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(v.name, v.emoji, v.description, v.isFreezer ? 1 : 0, max.m + 1);
    refresh();
    return { ok: true, data: { id: info.lastInsertRowid as number } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateLocation(
  raw: z.input<typeof LocationInput> & { id: number },
): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const parsed = LocationInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const v = parsed.data;
  try {
    db.prepare(
      "UPDATE locations SET name = ?, emoji = ?, description = ?, is_freezer = ? WHERE id = ?",
    ).run(v.name, v.emoji, v.description, v.isFreezer ? 1 : 0, raw.id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteLocation(id: number): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM stock_entries WHERE location_id = ?")
      .get(id) as { n: number };
    if (count.n > 0) {
      return {
        ok: false,
        error: "Empty this place first — it still has things in it.",
      };
    }
    db.prepare("DELETE FROM locations WHERE id = ?").run(id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function reorderLocations(ids: number[]): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    const update = db.prepare("UPDATE locations SET sort_order = ? WHERE id = ?");
    db.transaction(() => ids.forEach((id, i) => update.run(i, id)))();
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/* --------------------------------------------------------------- shopping -- */

export async function addShoppingItem(input: {
  name: string;
  quantity?: number;
  unit?: string | null;
  productId?: number | null;
}): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Type something to add" };
  try {
    db.prepare(
      "INSERT INTO shopping_items (product_id, name, quantity, unit) VALUES (?, ?, ?, ?)",
    ).run(input.productId ?? null, name, input.quantity ?? 1, input.unit ?? null);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function toggleShoppingItem(input: {
  id: number;
  checked: boolean;
}): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("UPDATE shopping_items SET checked = ? WHERE id = ?").run(
      input.checked ? 1 : 0,
      input.id,
    );
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function deleteShoppingItem(id: number): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("DELETE FROM shopping_items WHERE id = ?").run(id);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearCheckedShoppingItems(): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare("DELETE FROM shopping_items WHERE checked = 1").run();
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/** Pulls everything that's run low onto the list in one tap. */
export async function addLowStockToShoppingList(): Promise<
  ActionResult<{ added: number }>
> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    const added = db.transaction(() => {
      const low = db
        .prepare(
          `SELECT p.id, p.name, p.unit, p.min_stock,
                  COALESCE((SELECT SUM(quantity) FROM stock_entries s
                             WHERE s.product_id = p.id), 0) AS in_stock
             FROM products p
            WHERE p.min_stock > 0
              AND COALESCE((SELECT SUM(quantity) FROM stock_entries s
                             WHERE s.product_id = p.id), 0) <= p.min_stock`,
        )
        .all() as Array<{
        id: number;
        name: string;
        unit: string;
        min_stock: number;
        in_stock: number;
      }>;

      let n = 0;
      for (const item of low) {
        const already = db
          .prepare("SELECT id FROM shopping_items WHERE product_id = ? AND checked = 0")
          .get(item.id);
        if (already) continue;
        db.prepare(
          "INSERT INTO shopping_items (product_id, name, quantity, unit) VALUES (?, ?, ?, ?)",
        ).run(
          item.id,
          item.name,
          Math.max(1, Math.ceil(item.min_stock - item.in_stock)),
          item.unit,
        );
        n += 1;
      }
      return n;
    })();
    refresh();
    return { ok: true, data: { added } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/* --------------------------------------------------------------- settings -- */

export async function setSetting(key: string, value: string): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(key, value);
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

/* ------------------------------------------------------------ sample data -- */

type SampleItem = {
  name: string;
  brand: string | null;
  unit: string;
  days: number;
  location: number;
  type: DateType;
  /** Long-life goods usually print just a month, so the samples do too. */
  precision?: DatePrecision;
};

// Fresh, perishable things carry a use-by; store-cupboard things a best-before.
const SAMPLE: SampleItem[] = [
  { name: "Semi-skimmed milk", brand: "Tesco", unit: "bottle", days: 3, location: 0, type: "use_by" },
  { name: "Cheddar cheese", brand: "Cathedral City", unit: "pack", days: 14, location: 0, type: "use_by" },
  { name: "Greek yoghurt", brand: "Fage", unit: "pack", days: 1, location: 0, type: "use_by" },
  { name: "Eggs", brand: "Happy Egg Co", unit: "pack", days: 9, location: 0, type: "best_before" },
  { name: "Chicken breasts", brand: null, unit: "pack", days: -1, location: 0, type: "use_by" },
  { name: "Butter", brand: "Lurpak", unit: "pack", days: 30, location: 0, type: "best_before" },
  { name: "Peas", brand: "Birds Eye", unit: "bag", days: 240, location: 1, type: "best_before", precision: "month" },
  { name: "Fish fingers", brand: "Birds Eye", unit: "pack", days: 180, location: 1, type: "best_before", precision: "month" },
  { name: "Chopped tomatoes", brand: "Napolina", unit: "can", days: 400, location: 2, type: "best_before", precision: "month" },
  { name: "Penne pasta", brand: "Barilla", unit: "pack", days: 300, location: 2, type: "best_before", precision: "month" },
  { name: "Basmati rice", brand: "Tilda", unit: "bag", days: 260, location: 2, type: "best_before", precision: "month" },
  { name: "Baked beans", brand: "Heinz", unit: "can", days: 500, location: 2, type: "best_before", precision: "month" },
  { name: "Cornflakes", brand: "Kellogg's", unit: "pack", days: 60, location: 3, type: "best_before", precision: "month" },
  { name: "Sourdough loaf", brand: null, unit: "item", days: 2, location: 3, type: "best_before" },
  { name: "Digestives", brand: "McVitie's", unit: "pack", days: 90, location: 3, type: "best_before", precision: "month" },
  { name: "Bananas", brand: null, unit: "item", days: 4, location: 4, type: "best_before" },
  { name: "Spinach", brand: null, unit: "bag", days: 2, location: 4, type: "use_by" },
  { name: "Carrots", brand: null, unit: "bag", days: 11, location: 4, type: "best_before" },
  { name: "Orange juice", brand: "Tropicana", unit: "bottle", days: 6, location: 5, type: "use_by" },
  { name: "Sparkling water", brand: "Highland Spring", unit: "bottle", days: 300, location: 5, type: "best_before", precision: "month" },
];

/** Fills an empty kitchen with believable stock so the app can be tried out. */
export async function loadSampleData(): Promise<ActionResult<{ added: number }>> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    const added = db.transaction(() => {
      const locations = db
        .prepare("SELECT * FROM locations ORDER BY sort_order, name")
        .all() as Location[];
      if (locations.length === 0) throw new Error("Add a storage place first.");

      let n = 0;
      for (const item of SAMPLE) {
        const location = locations[Math.min(item.location, locations.length - 1)];
        const existing = db
          .prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(?)")
          .get(item.name) as { id: number } | undefined;

        const productId =
          existing?.id ??
          (db
            .prepare(
              `INSERT INTO products (name, brand, unit, default_location_id, default_date_type)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(item.name, item.brand, item.unit, location.id, item.type)
            .lastInsertRowid as number);

        const expiry = new Date();
        expiry.setDate(expiry.getDate() + item.days);
        const precision = item.precision ?? "day";
        const iso =
          precision === "month" ? endOfMonthISO(todayISO(expiry)) : todayISO(expiry);

        db.prepare(
          `INSERT INTO stock_entries
             (product_id, location_id, quantity, expiry_date, date_type,
              date_precision, purchased_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          productId,
          location.id,
          1 + Math.floor(Math.random() * 3),
          iso,
          item.type,
          precision,
          todayISO(),
        );
        n += 1;
      }
      return n;
    })();
    refresh();
    return { ok: true, data: { added } };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function clearAllStock(): Promise<ActionResult> {
  const denied = await requireSignedIn();
  if (denied) return denied;

  try {
    db.transaction(() => {
      db.prepare("DELETE FROM stock_entries").run();
      db.prepare("DELETE FROM activity").run();
    })();
    refresh();
    return { ok: true, data: undefined };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
