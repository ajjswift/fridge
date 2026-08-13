import Link from "next/link";
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SearchField } from "@/components/search-field";
import { StockRow } from "@/components/stock-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { todayISO } from "@/lib/dates";
import { getSoonDays, searchStockLines } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw ?? "").trim();

  const results = query.length >= 1 ? await searchStockLines(query) : [];
  const today = todayISO();
  const soonDays = await getSoonDays();

  return (
    <div className="pb-6">
      <PageHeader title="Search" backHref="/" compact />

      <div className="px-4">
        <SearchField initialValue={query} />
      </div>

      <div className="mt-4 px-4">
        {query.length === 0 ? (
          <div className="pt-10 text-center">
            <PackageSearch
              className="mx-auto size-10 text-muted-foreground/40"
              aria-hidden
            />
            <p className="mt-3 text-sm text-muted-foreground">
              Type a name, a brand, or a barcode.
            </p>
          </div>
        ) : results.length === 0 ? (
          <Card className="items-center gap-3 p-8 text-center">
            <p className="font-semibold">Nothing called &ldquo;{query}&rdquo;</p>
            <p className="text-sm text-muted-foreground">
              It might have run out, or be saved under a different name.
            </p>
            <Button asChild variant="outline" className="mt-1 h-11 rounded-xl">
              <Link href={`/add?name=${encodeURIComponent(query)}`}>
                Add it to your kitchen
              </Link>
            </Button>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {results.map((line, i) => (
              <StockRow
                key={`${line.product_id}-${line.location_id}`}
                productId={line.product_id}
                name={line.name}
                brand={line.brand}
                imageUrl={line.image_url}
                quantity={line.quantity}
                unit={line.unit}
                expiry={line.next_expiry}
                dateType={line.next_date_type}
                datePrecision={line.next_date_precision}
                locationLabel={`${line.location_emoji} ${line.location_name}`}
                today={today}
                soonDays={soonDays}
                className={cn(i > 0 && "border-t")}
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
