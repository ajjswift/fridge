import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { StockRow } from "@/components/stock-row";
import { Card } from "@/components/ui/card";
import { daysUntil, todayISO } from "@/lib/dates";
import { getExpiringLines, getSoonDays, type ExpiringLine } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const WINDOWS = [
  { days: 7, label: "This week" },
  { days: 30, label: "This month" },
  { days: 3650, label: "Everything" },
];

export default async function ExpiringPage({ searchParams }: PageProps<"/expiring">) {
  const params = await searchParams;
  const requested = Number(Array.isArray(params.days) ? params.days[0] : params.days);
  const windowDays = WINDOWS.some((w) => w.days === requested) ? requested : 7;

  const today = todayISO();
  const soonDays = getSoonDays();
  const lines = getExpiringLines(windowDays);

  const past = lines.filter((l) => daysUntil(l.expiry_date, today) < 0);
  // Split by what the date actually means: a passed use-by is a safety call,
  // a passed best-before is only about quality.
  const unsafe = past.filter((l) => l.date_type === "use_by");
  const pastBest = past.filter((l) => l.date_type !== "use_by");
  const upcoming = lines.filter((l) => daysUntil(l.expiry_date, today) >= 0);

  return (
    <div className="pb-6">
      <PageHeader title="Needs eating" subtitle="Sorted by what goes off first" backHref="/" />

      <div className="no-scrollbar mb-4 flex gap-1.5 overflow-x-auto px-4">
        {WINDOWS.map((w) => (
          <Link
            key={w.days}
            href={`/expiring?days=${w.days}`}
            scroll={false}
            className={cn(
              "tap-scale shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium",
              w.days === windowDays
                ? "bg-foreground text-background"
                : "border bg-card text-muted-foreground",
            )}
          >
            {w.label}
          </Link>
        ))}
      </div>

      {lines.length === 0 ? (
        <div className="px-4">
          <Card className="items-center gap-3 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-fresh-muted text-4xl">
              🎉
            </div>
            <p className="font-semibold">Nothing to worry about</p>
            <p className="text-sm text-muted-foreground">
              Nothing goes off in this period.
            </p>
          </Card>
        </div>
      ) : (
        <div className="space-y-6 px-4">
          {unsafe.length > 0 && (
            <Group
              title="Past their use by"
              hint="These are safety dates — don't eat them, even if they look fine."
              tone="danger"
              lines={unsafe}
              today={today}
              soonDays={soonDays}
            />
          )}
          {pastBest.length > 0 && (
            <Group
              title="Past their best before"
              hint="Quality dates, not safety ones. Have a look and a sniff — most of this is still fine."
              tone="warn"
              lines={pastBest}
              today={today}
              soonDays={soonDays}
            />
          )}
          {upcoming.length > 0 && (
            <Group
              title="Coming up"
              lines={upcoming}
              today={today}
              soonDays={soonDays}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  hint,
  tone = "neutral",
  lines,
  today,
  soonDays,
}: {
  title: string;
  hint?: string;
  tone?: "neutral" | "danger" | "warn";
  lines: ExpiringLine[];
  today: string;
  soonDays: number;
}) {
  return (
    <section>
      <h2
        className={cn(
          "mb-1 text-[1.05rem] font-semibold tracking-tight",
          tone === "danger" && "text-danger-foreground",
          tone === "warn" && "text-warn-foreground",
        )}
      >
        {title}
      </h2>
      {hint && <p className="mb-2.5 text-sm text-muted-foreground">{hint}</p>}
      <Card className="gap-0 overflow-hidden p-0">
        {lines.map((line, i) => (
          <StockRow
            key={`${line.product_id}-${line.location_id}-${line.expiry_date}-${line.date_type}`}
            productId={line.product_id}
            name={line.name}
            brand={line.brand}
            imageUrl={line.image_url}
            quantity={line.quantity}
            unit={line.unit}
            expiry={line.expiry_date}
            dateType={line.date_type}
            datePrecision={line.date_precision}
            locationLabel={`${line.location_emoji} ${line.location_name}`}
            today={today}
            soonDays={soonDays}
            className={cn(i > 0 && "border-t")}
          />
        ))}
      </Card>
    </section>
  );
}
