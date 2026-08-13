"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownAZ, CalendarClock, Plus, Search } from "lucide-react";
import { StockRow } from "@/components/stock-row";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { expiryStatus } from "@/lib/dates";
import type { StockLine } from "@/lib/types";
import { cn } from "@/lib/utils";

type Filter = "all" | "soon" | "expired";

export function LocationStockList({
  lines,
  today,
  soonDays,
  locationId,
  locationName,
}: {
  lines: StockLine[];
  today: string;
  soonDays: number;
  locationId: number;
  locationName: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [byName, setByName] = useState(false);
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    let soon = 0;
    let expired = 0;
    for (const line of lines) {
      const status = expiryStatus(line.next_expiry, soonDays, today);
      if (status === "soon") soon += 1;
      if (status === "expired") expired += 1;
    }
    return { soon, expired };
  }, [lines, soonDays, today]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = lines.filter((line) => {
      if (needle && !`${line.name} ${line.brand ?? ""}`.toLowerCase().includes(needle)) {
        return false;
      }
      if (filter === "all") return true;
      return expiryStatus(line.next_expiry, soonDays, today) === filter;
    });
    if (!byName) return filtered;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [lines, filter, byName, query, soonDays, today]);

  if (lines.length === 0) {
    return (
      <div className="px-4">
        <Card className="items-center gap-4 p-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-4xl">
            🕳️
          </div>
          <div>
            <p className="font-semibold">Nothing in the {locationName} yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Scan a barcode or add something by hand.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2">
            <Button asChild size="lg" className="h-12 rounded-xl text-base">
              <Link href={`/scan?location=${locationId}`}>Scan into here</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-xl text-base">
              <Link href={`/add?location=${locationId}`}>Add by hand</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="sticky top-[3.75rem] z-30 bg-background/90 px-4 pb-3 pt-1 backdrop-blur-xl">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find in the ${locationName.toLowerCase()}`}
            aria-label={`Search the ${locationName}`}
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-[0.95rem] outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
          />
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <div className="no-scrollbar -mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1">
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              All
            </Chip>
            <Chip
              active={filter === "soon"}
              onClick={() => setFilter("soon")}
              tone="warn"
              disabled={counts.soon === 0}
            >
              Use soon {counts.soon > 0 && `· ${counts.soon}`}
            </Chip>
            <Chip
              active={filter === "expired"}
              onClick={() => setFilter("expired")}
              tone="danger"
              disabled={counts.expired === 0}
            >
              Out of date {counts.expired > 0 && `· ${counts.expired}`}
            </Chip>
          </div>
          <button
            type="button"
            onClick={() => setByName((v) => !v)}
            aria-label={byName ? "Sort by date instead" : "Sort by name instead"}
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-xl border bg-card text-muted-foreground"
          >
            {byName ? (
              <ArrowDownAZ className="size-4" aria-hidden />
            ) : (
              <CalendarClock className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="px-4">
        <Card className="gap-0 overflow-hidden p-0">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nothing matches that.
            </p>
          ) : (
            visible.map((line, i) => (
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
                entryCount={line.entry_count}
                opened={line.any_opened === 1}
                today={today}
                soonDays={soonDays}
                className={cn(i > 0 && "border-t")}
              />
            ))
          )}
        </Card>

        <Button
          asChild
          variant="outline"
          size="lg"
          className="mt-3 h-12 w-full rounded-xl text-base"
        >
          <Link href={`/add?location=${locationId}`}>
            <Plus className="size-4.5" aria-hidden />
            Add to the {locationName.toLowerCase()}
          </Link>
        </Button>
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
  tone = "neutral",
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "neutral" | "warn" | "danger";
  disabled?: boolean;
}) {
  const activeTone = {
    neutral: "bg-foreground text-background",
    warn: "bg-warn text-background",
    danger: "bg-danger text-background",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "tap-scale shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
        active ? activeTone : "border bg-card text-muted-foreground",
        disabled && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}
