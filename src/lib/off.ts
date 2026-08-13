import "server-only";

/**
 * Open Food Facts is a free, open database of grocery barcodes. It has good UK
 * and EU coverage; a miss just means the user types the name themselves.
 */
export type LookupResult = {
  found: boolean;
  name?: string;
  brand?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  quantity?: string | null;
};

const FIELDS = [
  "product_name",
  "product_name_en",
  "generic_name",
  "brands",
  "image_front_small_url",
  "image_small_url",
  "quantity",
  "categories",
].join(",");

/**
 * Contributor-entered names arrive as "COCA COLA", "coca-cola" or "Nutella".
 * Normalise the shouty and the shy, and leave deliberate casing alone.
 */
function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => {
      if (/[a-z]/.test(word) && /[A-Z]/.test(word)) return word;
      return word
        .toLowerCase()
        .replace(/(^|[-'’/])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(" ");
}

export async function lookupBarcode(barcode: string): Promise<LookupResult> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 6) return { found: false };

  // Try Open Food Facts first — best source for UK/EU groceries. If it's down
  // or doesn't have the product, fall through to UPCitemdb.
  const off = await lookupOpenFoodFacts(code);
  if (off.found) return off;

  const upc = await lookupUPCitemdb(code);
  if (upc.found) return upc;

  return { found: false };
}

/* -------------------------------------------------------- Open Food Facts -- */

async function lookupOpenFoodFacts(code: string): Promise<LookupResult> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${FIELDS}`,
      {
        headers: {
          // Open Food Facts asks apps to identify themselves.
          "User-Agent": "Recime/1.0 (self-hosted kitchen inventory)",
          Accept: "application/json",
        },
        // The barcode-to-product mapping essentially never changes.
        next: { revalidate: 60 * 60 * 24 * 30 },
        signal: AbortSignal.timeout(6000),
      },
    );

    if (!response.ok) return { found: false };
    const data = (await response.json()) as {
      status?: number;
      product?: Record<string, string | undefined>;
    };
    const product = data.product;
    if (data.status !== 1 || !product) return { found: false };

    const rawName =
      product.product_name?.trim() ||
      product.product_name_en?.trim() ||
      product.generic_name?.trim();
    if (!rawName) return { found: false };

    const name = titleCase(rawName);
    const rawBrand = product.brands?.split(",")[0]?.trim();
    const brand = rawBrand ? titleCase(rawBrand) : null;

    return {
      found: true,
      name,
      // Own-brand products list the brand as the name too; don't repeat it.
      brand: brand && brand.toLowerCase() !== name.toLowerCase() ? brand : null,
      imageUrl: product.image_front_small_url || product.image_small_url || null,
      category: product.categories?.split(",")[0]?.trim() || null,
      quantity: product.quantity?.trim() || null,
    };
  } catch {
    // Offline, timed out, or the service is down — fall back to manual entry.
    return { found: false };
  }
}

/* --------------------------------------------------------------- UPCitemdb -- */

/**
 * Free trial tier — 100 lookups per day, no API key. Different infrastructure
 * from Open Food Facts, so it stays up when OFF goes down. Coverage is decent
 * for UK, US and EU products.
 */
async function lookupUPCitemdb(code: string): Promise<LookupResult> {
  try {
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Recime/1.0 (self-hosted kitchen inventory)",
        },
        next: { revalidate: 60 * 60 * 24 * 30 },
        signal: AbortSignal.timeout(6000),
      },
    );

    if (!response.ok) return { found: false };
    const data = (await response.json()) as {
      code?: string;
      total?: number;
      items?: Array<{
        title?: string;
        brand?: string;
        images?: string[];
        category?: string;
      }>;
    };

    if (data.code !== "OK" || !data.items?.length) return { found: false };
    const item = data.items[0];
    const rawName = item.title?.trim();
    if (!rawName) return { found: false };

    const name = titleCase(rawName);
    const rawBrand = item.brand?.trim();
    const brand = rawBrand ? titleCase(rawBrand) : null;

    return {
      found: true,
      name,
      brand: brand && brand.toLowerCase() !== name.toLowerCase() ? brand : null,
      imageUrl: item.images?.[0] || null,
      category: item.category?.split(",")[0]?.trim() || null,
    };
  } catch {
    return { found: false };
  }
}
