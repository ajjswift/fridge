import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { LocationStockList } from "@/components/location-stock-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { todayISO } from "@/lib/dates";
import { getLocation, getSoonDays, getStockLinesByLocation } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LocationPage({ params }: PageProps<"/locations/[id]">) {
  const { id } = await params;
  const locationId = Number(id);
  if (!Number.isInteger(locationId)) notFound();

  const location = getLocation(locationId);
  if (!location) notFound();

  const lines = getStockLinesByLocation(locationId);
  const soonDays = getSoonDays();
  const today = todayISO();

  return (
    <div className="pb-6">
      <PageHeader
        title={`${location.emoji} ${location.name}`}
        subtitle={
          lines.length === 0
            ? "Nothing in here yet"
            : `${lines.length} ${lines.length === 1 ? "thing" : "things"} inside`
        }
        backHref="/locations"
        action={
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link
              href={`/add?location=${location.id}`}
              aria-label={`Add something to ${location.name}`}
            >
              <Plus className="size-5" />
            </Link>
          </Button>
        }
      />

      <LocationStockList
        lines={lines}
        today={today}
        soonDays={soonDays}
        locationId={location.id}
        locationName={location.name}
      />
    </div>
  );
}
