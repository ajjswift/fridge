import type { DatabaseAdapter } from "./db-adapter";

type ProductForMatch = { id: number; name: string; brand: string | null; category?: string | null };
type ShoppingRow = { id: number; name: string; product_id: number | null };

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

function categoryWords(value: string) {
  return words(value).map((word) =>
    // Category vocabularies commonly pluralise labels ("Pastas", "Milks").
    // This is a language-agnostic, deliberately small normalisation—not a
    // product dictionary—and is only used against trusted provider metadata.
    word.length > 3 && word.endsWith("s") && !word.endsWith("ss")
      ? word.slice(0, -1)
      : word,
  );
}

function categoryMatches(wanted: string[], category: string | null | undefined) {
  if (!category || wanted.length !== 1) return false;
  const categoryTerms = categoryWords(category);
  const requested = categoryWords(wanted[0])[0];
  return Boolean(requested) && categoryTerms.includes(requested);
}

export function isConfidentShoppingMatch(item: ShoppingRow, product: ProductForMatch) {
  if (item.product_id === product.id) return true;

  const wanted = words(item.name);
  const scanned = words(product.name);
  const wantedKey = wanted.join(" ");
  const scannedKey = scanned.join(" ");
  if (!wantedKey || !scannedKey) return false;
  if (wantedKey === scannedKey) return true;

  // A broad request such as "pasta" can safely satisfy a scan of "fusilli"
  // only when the barcode provider classifies the scanned item as pasta. This
  // avoids an ever-growing hand-maintained list of food names.
  if (categoryMatches(wanted, product.category)) return true;

  // For uncategorised/manual products, accept a free-typed leading product
  // name ("minstrels" → "Minstrels Milk Chocolate"). Requiring the first
  // word stops broad trailing descriptors such as "chocolate" from silently
  // removing a different item, without maintaining a food-name dictionary.
  return wanted.length === 1 && wanted[0].length >= 7 && wanted[0] === scanned[0];
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
