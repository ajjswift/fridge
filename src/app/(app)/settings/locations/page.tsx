import { PageHeader } from "@/components/page-header";
import { LocationManager } from "@/components/location-manager";
import { getLocationSummaries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function ManageLocationsPage() {
  return (
    <div className="pb-6">
      <PageHeader
        title="Places"
        subtitle="Cupboards, shelves, the garage freezer — anywhere you keep food"
        backHref="/settings"
        compact
      />
      <LocationManager locations={await getLocationSummaries()} />
    </div>
  );
}
