import type { DatabaseAdapter } from "./db-adapter";

type ProductForMatch = { id: number; name: string; brand: string | null };
type ShoppingRow = { id: number; name: string; product_id: number | null };

const GENERIC_WORDS = new Set([
  "milk", "bread", "pasta", "cheese", "chocolate", "eggs", "rice", "beans",
  "butter", "water", "juice", "yoghurt", "yogurt", "coffee", "tea", "flour",
]);

function words(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Pack sizes vary with the SKU and should not stop an otherwise exact match.
    .replace(/\b\d+(?:[.,]\d+)?\s?(?:kg|g|mg|l|ml|cl|oz|lb)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isConfidentShoppingMatch(item: ShoppingRow, product: ProductForMatch) {
  if (item.product_id === product.id) return true;

  const wanted = words(item.name);
  const scanned = words(product.name);
  const wantedKey = wanted.join(" ");
  const scannedKey = scanned.join(" ");
  if (!wantedKey || !scannedKey) return false;
  if (wantedKey === scannedKey) return true;

  // Only match a free-typed partial name when it contains an unusually specific
  // word (e.g. "minstrels"). Generic one-word requests such as "milk" or
  // "pasta" deliberately need an exact name to avoid removing the wrong thing.
  const specific = wanted.filter((word) => word.length >= 7 && !GENERIC_WORDS.has(word));
  return specific.length > 0 && wanted.every((word) => scanned.includes(word));
}

/** Remove at most one list entry: one scanned item should satisfy one request. */
export async function removeOneMatchedShoppingItem(
  db: DatabaseAdapter,
  product: ProductForMatch,
): Promise<string | null> {
  const items = await db.all<ShoppingRow>(
    "SELECT id, name, product_id FROM shopping_items ORDER BY checked, created_at, id",
  );
  const matched = items.find((item) => isConfidentShoppingMatch(item, product));
  if (!matched) return null;
  await db.run("DELETE FROM shopping_items WHERE id = ?", matched.id);
  return matched.name;
}
