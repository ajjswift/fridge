import { PageHeader } from "@/components/page-header";
import { LocationManager } from "@/components/location-manager";
import { getLocationSummaries } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** Same screen as /settings/locations, with the "new place" sheet already open. */
export default function NewLocationPage() {
  return (
    <div className="pb-6">
      <PageHeader
        title="Places"
        subtitle="Cupboards, shelves, the garage freezer — anywhere you keep food"
        backHref="/locations"
        compact
      />
      <LocationManager locations={getLocationSummaries()} autoOpenNew />
    </div>
  );
}
