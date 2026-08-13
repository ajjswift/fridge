import { AddItemForm } from "@/components/add-item-form";
import { PageHeader } from "@/components/page-header";
import { todayISO } from "@/lib/dates";
import { dateFromGS1, parseGS1 } from "@/lib/gs1";
import { lookupBarcode } from "@/lib/off";
import { getLocations, getProduct, getProductByBarcode } from "@/lib/queries";
import { DEFAULT_UNIT } from "@/lib/types";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AddPage({ searchParams }: PageProps<"/add">) {
  const params = await searchParams;
  const locations = getLocations();
  const today = todayISO();

  // The scanner may hand over a whole GS1 element string rather than a plain
  // barcode; if so it can also carry the use-by or best-before date.
  const rawCode = first(params.barcode)?.trim() ?? null;
  const gs1 = rawCode ? parseGS1(rawCode) : null;
  const scannedDate = gs1 ? dateFromGS1(gs1) : null;
  const barcode = gs1?.barcode ?? rawCode?.replace(/\D/g, "") ?? null;

  const productId = Number(first(params.product));
  const requestedLocation = Number(first(params.location));

  let product =
    Number.isInteger(productId) && productId > 0 ? getProduct(productId) : undefined;
  if (!product && barcode) product = getProductByBarcode(barcode);

  // Only reach out to the internet for a code we've never seen.
  const lookup = !product && barcode ? await lookupBarcode(barcode) : null;

  const preset = {
    productId: product?.id ?? null,
    name: product?.name ?? lookup?.name ?? first(params.name) ?? "",
    brand: product?.brand ?? lookup?.brand ?? "",
    imageUrl: product?.image_url ?? lookup?.imageUrl ?? null,
    category: lookup?.category ?? null,
    unit: product?.unit ?? DEFAULT_UNIT,
    barcode,
    defaultDateType: product?.default_date_type ?? null,
    scannedDate: scannedDate
      ? { iso: scannedDate.iso, precision: scannedDate.precision, type: scannedDate.type }
      : null,
    minStock: product?.min_stock ?? 0,
    locationId:
      (Number.isInteger(requestedLocation) && requestedLocation > 0
        ? requestedLocation
        : null) ??
      product?.default_location_id ??
      locations[0]?.id ??
      null,
  };

  const heading = product
    ? `Add more ${product.name.toLowerCase()}`
    : lookup?.found
      ? "Found it"
      : barcode
        ? "New item"
        : "Add something";

  const subtitle = scannedDate
    ? "The barcode carried a date — check it matches the packet"
    : product
      ? "Filled in from last time — the date's up to you"
      : lookup?.found
        ? "Details came from Open Food Facts — change anything that looks wrong"
        : barcode
          ? "We don't know this barcode yet — tell us what it is"
          : "Put something away without scanning";

  return (
    <div className="pb-6">
      <PageHeader title={heading} subtitle={subtitle} backHref="/" compact />
      <AddItemForm locations={locations} preset={preset} today={today} />
    </div>
  );
}
