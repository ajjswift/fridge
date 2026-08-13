import { ScannerScreen } from "@/components/scanner-screen";
import { todayISO } from "@/lib/dates";
import { getLocations } from "@/lib/queries";

export const dynamic = "force-dynamic";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ScanPage({ searchParams }: PageProps<"/scan">) {
  const params = await searchParams;
  const locations = await getLocations();
  const requested = Number(first(params.location));
  const initialLocationId =
    locations.find((l) => l.id === requested)?.id ?? locations[0]?.id ?? null;

  return (
    <ScannerScreen
      locations={locations}
      initialLocationId={initialLocationId}
      today={todayISO()}
    />
  );
}
