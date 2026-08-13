import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  Clock,
  PackageOpen,
  Search,
  Sparkles,
} from "lucide-react";
import { ExpiryChip } from "@/components/freshness";
import { ProductThumb } from "@/components/product-thumb";
import { SampleDataButton } from "@/components/sample-data-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { expiryStatus, formatQty, pluralUnit, todayISO } from "@/lib/dates";
import {
  getExpiringLines,
  getKitchenTotals,
  getLocationSummaries,
  getSetting,
  getSoonDays,
} from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SHOW_EXAMPLE_DATA = process.env.NODE_ENV === "development";

function greeting(hour: number) {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const today = todayISO();
  const soonDays = await getSoonDays();
  const [totals, locations, expiring, householdName] = await Promise.all([
    getKitchenTotals(), getLocationSummaries(), getExpiringLines(soonDays),
    getSetting("household_name", "Our kitchen"),
  ]);

  const urgent = expiring.slice(0, 4);
  const empty = totals.units === 0;

  return (
    <div className="pb-6">
      <header className="px-4 pt-3">
        <div className="safe-top" />
        <p className="text-sm font-medium text-muted-foreground">
          {greeting(new Date().getHours())}
        </p>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight">
          {householdName}
        </h1>

        <Link
          href="/search"
          className="tap-scale mt-4 flex h-11 items-center gap-2.5 rounded-2xl border bg-card px-4 text-muted-foreground shadow-sm"
        >
          <Search className="size-4.5" aria-hidden />
          <span className="text-[0.95rem]">Search your kitchen</span>
        </Link>
      </header>

      {empty ? (
        <EmptyKitchen showExamples={SHOW_EXAMPLE_DATA} />
      ) : (
        <>
          <section className="mt-5 grid grid-cols-3 gap-2 px-4">
            <StatTile
              value={totals.units}
              label="in the kitchen"
              tone="neutral"
              href="/locations"
            />
            <StatTile
              value={totals.soon}
              label="use soon"
              tone="warn"
              href="/expiring"
              icon={Clock}
            />
            <StatTile
              value={totals.expired}
              label="out of date"
              tone="danger"
              href="/expiring"
              icon={CircleAlert}
            />
          </section>

          <section className="mt-6">
            <SectionHeading
              title="Eat these first"
              href={expiring.length > urgent.length ? "/expiring" : undefined}
              hint={
                expiring.length > urgent.length
                  ? `All ${expiring.length}`
                  : undefined
              }
            />
            {urgent.length === 0 ? (
              <div className="px-4">
                <Card className="flex flex-row items-center gap-3 border-fresh/25 bg-fresh-muted/60 p-4 shadow-none">
                  <div className="flex size-10 items-center justify-center rounded-full bg-background/70 text-xl">
                    ✨
                  </div>
                  <div>
                    <p className="font-medium text-fresh-foreground">
                      Nothing needs eating
                    </p>
                    <p className="text-sm text-fresh-foreground/75">
                      Everything has more than {soonDays} days left.
                    </p>
                  </div>
                </Card>
              </div>
            ) : (
              <div className="px-4">
                <Card className="gap-0 overflow-hidden p-0">
                  {urgent.map((line, i) => {
                    const status = expiryStatus(line.expiry_date, soonDays, today);
                    return (
                      <Link
                        key={`${line.product_id}-${line.location_id}-${line.expiry_date}`}
                        href={`/products/${line.product_id}`}
                        className={cn(
                          "tap-scale flex items-center gap-3 px-3.5 py-3 active:bg-muted/60",
                          i > 0 && "border-t",
                        )}
                      >
                        <ProductThumb
                          name={line.name}
                          brand={line.brand}
                          imageUrl={line.image_url}
                          status={status}
                          dateType={line.date_type}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium leading-tight">
                            {line.name}
                          </p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {formatQty(line.quantity)}{" "}
                            {pluralUnit(line.unit, line.quantity)} ·{" "}
                            {line.location_emoji} {line.location_name}
                          </p>
                        </div>
                        <ExpiryChip
                          date={line.expiry_date}
                          status={status}
                          today={today}
                          type={line.date_type}
                          precision={line.date_precision}
                        />
                      </Link>
                    );
                  })}
                </Card>
              </div>
            )}
          </section>

          <section className="mt-6">
            <SectionHeading title="Where things are" href="/locations" hint="All" />
            <div className="grid grid-cols-2 gap-3 px-4">
              {locations.slice(0, 4).map((loc) => (
                <Link
                  key={loc.id}
                  href={`/locations/${loc.id}`}
                  className="tap-scale rounded-2xl border bg-card p-3.5 shadow-sm active:bg-muted/50"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl leading-none">{loc.emoji}</span>
                    {loc.expired_count > 0 ? (
                      <span className="rounded-full bg-danger-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-danger-foreground">
                        {loc.expired_count} off
                      </span>
                    ) : loc.soon_count > 0 ? (
                      <span className="rounded-full bg-warn-muted px-1.5 py-0.5 text-[0.65rem] font-bold text-warn-foreground">
                        {loc.soon_count} soon
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2.5 truncate font-medium leading-tight">
                    {loc.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {loc.product_count === 0
                      ? "Empty"
                      : `${loc.product_count} ${loc.product_count === 1 ? "thing" : "things"}`}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="mt-6 px-4">
            <Link href="/scan" className="block">
              <Card className="tap-scale flex flex-row items-center gap-3.5 border-primary/20 bg-primary/5 p-4 shadow-none">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                  <PackageOpen className="size-5.5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-tight">Putting shopping away?</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Scan each barcode — it&apos;s much faster.
                  </p>
                </div>
                <ArrowRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Card>
            </Link>
          </section>
        </>
      )}
    </div>
  );
}

function SectionHeading({
  title,
  href,
  hint,
}: {
  title: string;
  href?: string;
  hint?: string;
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between px-4">
      <h2 className="text-[1.05rem] font-semibold tracking-tight">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-sm font-medium text-primary underline-offset-4 active:underline"
        >
          {hint ?? "See all"}
        </Link>
      )}
    </div>
  );
}

function StatTile({
  value,
  label,
  tone,
  href,
  icon: Icon,
}: {
  value: number;
  label: string;
  tone: "neutral" | "warn" | "danger";
  href: string;
  icon?: typeof Clock;
}) {
  const muted = value === 0;
  const tones = {
    neutral: "bg-card text-foreground",
    warn: muted ? "bg-card text-foreground" : "bg-warn-muted text-warn-foreground",
    danger: muted ? "bg-card text-foreground" : "bg-danger-muted text-danger-foreground",
  };

  return (
    <Link
      href={href}
      className={cn(
        "tap-scale rounded-2xl border p-3 shadow-sm",
        tones[tone],
        muted && "border-border",
        !muted && tone !== "neutral" && "border-transparent",
      )}
    >
      <div className="flex items-center gap-1">
        <span className="text-2xl font-semibold leading-none tabular-nums">
          {Math.round(value)}
        </span>
        {Icon && !muted && <Icon className="size-4 opacity-70" aria-hidden />}
      </div>
      <p className={cn("mt-1 text-xs leading-tight", muted && "text-muted-foreground")}>
        {label}
      </p>
    </Link>
  );
}

function EmptyKitchen({ showExamples }: { showExamples: boolean }) {
  return (
    <div className="mt-8 px-4">
      <Card className="items-center gap-4 p-7 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-4xl">
          🧺
        </div>
        <div>
          <h2 className="text-lg font-semibold">Your kitchen is empty</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Scan a barcode to put your first item away, or add one manually.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button asChild size="lg" className="h-12 rounded-xl text-base">
            <Link href="/scan">Scan something</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-xl text-base">
            <Link href="/add">Add without scanning</Link>
          </Button>
          {showExamples && (
            <SampleDataButton>
              <Sparkles className="size-4" aria-hidden />
              Fill with examples
            </SampleDataButton>
          )}
        </div>
      </Card>
    </div>
  );
}
