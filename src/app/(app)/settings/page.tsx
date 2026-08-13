import Link from "next/link";
import { ChevronRight, History, Refrigerator, Users } from "lucide-react";
import { DataButtons } from "@/components/data-buttons";
import { NotificationSettings } from "@/components/notification-settings";
import { PageHeader } from "@/components/page-header";
import { SettingsScreen } from "@/components/settings-screen";
import { Card } from "@/components/ui/card";
import { getUsers, requireUser } from "@/lib/auth";
import { countSubscriptions, getVapidPublicKey } from "@/lib/push";
import { getLocations, getSetting, getSoonDays } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await requireUser("/settings");
  const locations = getLocations();
  const people = getUsers();

  return (
    <div className="pb-6">
      <PageHeader title="Settings" subtitle={`Signed in as ${me.username}`} />

      <div className="space-y-6 px-4">
        <SettingsScreen
          householdName={getSetting("household_name", "Our kitchen")}
          soonDays={getSoonDays()}
        />

        <NotificationSettings
          vapidPublicKey={getVapidPublicKey()}
          notifyEnabled={getSetting("notify_enabled", "1") === "1"}
          notifyTime={getSetting("notify_time", "08:30")}
          householdDevices={countSubscriptions()}
        />

        <section>
          <SectionLabel>Your kitchen</SectionLabel>
          <Card className="gap-0 overflow-hidden p-0">
            <NavRow
              href="/settings/people"
              icon={<Users className="size-5" aria-hidden />}
              title="People"
              hint={`${people.length} ${people.length === 1 ? "account" : "accounts"}`}
            />
            <NavRow
              href="/settings/locations"
              icon={<Refrigerator className="size-5" aria-hidden />}
              title="Places"
              hint={`${locations.length} set up`}
              className="border-t"
            />
            <NavRow
              href="/activity"
              icon={<History className="size-5" aria-hidden />}
              title="Recent changes"
              hint="What's been added and used"
              className="border-t"
            />
          </Card>
        </section>

        <SettingsDangerZone />

        <p className="px-1 pb-2 text-center text-xs text-muted-foreground">
          Everything lives in one SQLite file on this machine — nothing is sent
          anywhere except barcode lookups.
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
      {children}
    </h2>
  );
}

function NavRow({
  href,
  icon,
  title,
  hint,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`tap-scale flex items-center gap-3.5 px-4 py-3.5 active:bg-muted/60 ${className ?? ""}`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium leading-tight">{title}</span>
        {hint && (
          <span className="block truncate text-sm text-muted-foreground">{hint}</span>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
    </Link>
  );
}

function SettingsDangerZone() {
  return (
    <section>
      <SectionLabel>Example data</SectionLabel>
      <Card className="gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          Fill the kitchen with a sample shop to try things out, or empty it to
          start fresh. Your places and item settings are kept either way.
        </p>
        <DataButtons />
      </Card>
    </section>
  );
}
