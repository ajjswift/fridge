import { notFound } from "next/navigation";
import { ProductScreen } from "@/components/product-screen";
import { todayISO } from "@/lib/dates";
import {
  getEntriesForProduct,
  getLocations,
  getProduct,
  getSoonDays,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: PageProps<"/products/[id]">) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isInteger(productId)) notFound();

  const product = getProduct(productId);
  if (!product) notFound();

  return (
    <ProductScreen
      product={product}
      entries={getEntriesForProduct(productId)}
      locations={getLocations()}
      soonDays={getSoonDays()}
      today={todayISO()}
    />
  );
}
