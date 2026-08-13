import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/dates";
import { getLocationSummaries } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default function LocationsPage() {
  const locations = getLocationSummaries();

  return (
    <div className="pb-6">
      <PageHeader
        title="Places"
        subtitle="Everywhere you keep food"
        action={
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link href="/settings/locations/new" aria-label="Add a place">
              <Plus className="size-5" />
            </Link>
          </Button>
        }
      />

      <div className="space-y-2.5 px-4">
        {locations.map((loc) => (
          <Link key={loc.id} href={`/locations/${loc.id}`} className="block">
            <Card className="tap-scale flex-row items-center gap-3.5 p-4 active:bg-muted/50">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl">
                {loc.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium leading-tight">{loc.name}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {loc.product_count === 0
                    ? "Nothing in here yet"
                    : `${loc.product_count} ${
                        loc.product_count === 1 ? "thing" : "things"
                      } · ${formatQty(loc.total_quantity)} in total`}
                </p>
                {(loc.expired_count > 0 || loc.soon_count > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {loc.expired_count > 0 && (
                      <Pill tone="danger">{loc.expired_count} out of date</Pill>
                    )}
                    {loc.soon_count > 0 && (
                      <Pill tone="warn">{loc.soon_count} to use soon</Pill>
                    )}
                  </div>
                )}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
            </Card>
          </Link>
        ))}

        <Link href="/settings/locations/new" className="block">
          <Card className="tap-scale flex-row items-center gap-3.5 border-dashed bg-transparent p-4 shadow-none active:bg-muted/50">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-dashed text-muted-foreground">
              <Plus className="size-5" aria-hidden />
            </div>
            <p className="font-medium text-muted-foreground">Add another place</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "danger" | "warn";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.7rem] font-semibold",
        tone === "danger"
          ? "bg-danger-muted text-danger-foreground"
          : "bg-warn-muted text-warn-foreground",
      )}
    >
      {children}
    </span>
  );
}
