import Link from "next/link";
import { Plus } from "lucide-react";
import { LocationsList } from "@/components/locations-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getLocationSummaries } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const locations = await getLocationSummaries();

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

      <LocationsList locations={locations} />
    </div>
  );
}
