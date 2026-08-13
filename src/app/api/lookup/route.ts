import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dateFromGS1, parseGS1 } from "@/lib/gs1";
import { lookupBarcode } from "@/lib/off";
import { getProductByBarcode } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * The scanner calls this the instant a barcode is read. Something you've bought
 * before resolves instantly from the kitchen database; anything new falls through to Open
 * Food Facts.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const raw = url.searchParams.get("barcode")?.trim();
  if (!raw) return NextResponse.json({ error: "Bad barcode" }, { status: 400 });

  // A GS1 payload carries the product identifier and, sometimes, the date.
  const gs1 = parseGS1(raw);
  const scanned = gs1 ? dateFromGS1(gs1) : null;
  const barcode = gs1?.barcode ?? raw;

  if (!/^\d{6,14}$/.test(barcode)) {
    return NextResponse.json({ error: "Bad barcode" }, { status: 400 });
  }

  const scannedDate = scanned
    ? { iso: scanned.iso, precision: scanned.precision, type: scanned.type }
    : null;

  const known = await getProductByBarcode(barcode);
  if (known) {
    return NextResponse.json({
      source: "known" as const,
      barcode,
      scannedDate,
      product: {
        id: known.id,
        name: known.name,
        brand: known.brand,
        imageUrl: known.image_url,
        category: known.category,
        unit: known.unit,
        defaultLocationId: known.default_location_id,
        defaultDateType: known.default_date_type,
        minStock: known.min_stock,
      },
    });
  }

  const result = await lookupBarcode(barcode);
  if (!result.found) {
    return NextResponse.json({
      source: "unknown" as const,
      barcode,
      scannedDate,
      lookupUnavailable: result.unavailable ?? false,
    });
  }

  return NextResponse.json({
    source: "openfoodfacts" as const,
    barcode,
    scannedDate,
    product: {
      id: null,
      name: result.name,
      brand: result.brand,
      imageUrl: result.imageUrl,
      category: result.category,
      packSize: result.quantity,
    },
  });
}
