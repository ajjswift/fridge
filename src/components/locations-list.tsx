"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DeleteLocationDialog } from "@/components/delete-location-dialog";
import { Card } from "@/components/ui/card";
import { formatQty } from "@/lib/dates";
import type { LocationSummary } from "@/lib/types";
import { cn } from "@/lib/utils";

const REVEAL_WIDTH = 104;

export function LocationsList({ locations }: { locations: LocationSummary[] }) {
  const [removing, setRemoving] = useState<LocationSummary | null>(null);

  return (
    <div className="space-y-2.5 px-4">
      <Card className="gap-0 overflow-hidden p-0">
        {locations.map((location, index) => (
          <SwipeableLocationRow
            key={location.id}
            location={location}
            bordered={index > 0}
            onRemove={() => setRemoving(location)}
          />
        ))}
      </Card>

      <Link href="/settings/locations/new" className="block">
        <Card className="tap-scale flex-row items-center gap-3.5 border-dashed bg-transparent p-4 shadow-none active:bg-muted/50">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-dashed text-muted-foreground">
            <Plus className="size-5" aria-hidden />
          </div>
          <p className="font-medium text-muted-foreground">Add another place</p>
        </Card>
      </Link>

      {locations.length > 0 && (
        <p className="px-1 text-center text-xs text-muted-foreground md:hidden">
          Swipe a place left to remove it once it&apos;s empty.
        </p>
      )}

      {removing && (
        <DeleteLocationDialog
          location={removing}
          open
          onOpenChange={(open) => !open && setRemoving(null)}
          onDeleted={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function SwipeableLocationRow({
  location,
  bordered,
  onRemove,
}: {
  location: LocationSummary;
  bordered: boolean;
  onRemove: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const gesture = useRef({ startX: 0, startY: 0, offset: 0, dragging: false });
  const empty = location.product_count === 0;

  function close() {
    gesture.current.offset = 0;
    setOffset(0);
  }

  return (
    <div className={cn("relative overflow-hidden bg-destructive", bordered && "border-t")}>
      <button
        type="button"
        className="absolute inset-y-0 right-0 flex w-[6.5rem] items-center justify-center gap-1.5 bg-destructive text-sm font-semibold text-white md:hidden"
        aria-label={empty ? `Remove ${location.name}` : `${location.name} must be empty before removal`}
        onClick={() => {
          close();
          if (!empty) {
            toast.error(`Empty ${location.name} before removing it.`);
            return;
          }
          onRemove();
        }}
      >
        <Trash2 className="size-4" aria-hidden />
        {empty ? "Remove" : "Empty first"}
      </button>

      <Link
        href={`/locations/${location.id}`}
        className="tap-scale relative z-10 flex items-center gap-3.5 bg-card p-4 active:bg-muted/50 md:translate-x-0"
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          gesture.current = { startX: touch.clientX, startY: touch.clientY, offset: 0, dragging: false };
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          const horizontal = touch.clientX - gesture.current.startX;
          const vertical = touch.clientY - gesture.current.startY;
          if (Math.abs(horizontal) <= Math.abs(vertical) || horizontal > 0) return;
          gesture.current.dragging = true;
          gesture.current.offset = Math.max(-REVEAL_WIDTH, horizontal);
          setOffset(gesture.current.offset);
        }}
        onTouchEnd={() => setOffset(gesture.current.offset < -REVEAL_WIDTH / 2 ? -REVEAL_WIDTH : 0)}
        onClick={(event) => {
          if (!gesture.current.dragging && offset === 0) return;
          event.preventDefault();
          gesture.current.dragging = false;
          close();
        }}
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl">
          {location.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium leading-tight">{location.name}</p>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {location.product_count === 0
              ? "Nothing in here yet"
              : `${location.product_count} ${location.product_count === 1 ? "thing" : "things"} · ${formatQty(location.total_quantity)} in total`}
          </p>
          {(location.expired_count > 0 || location.soon_count > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {location.expired_count > 0 && <Pill tone="danger">{location.expired_count} out of date</Pill>}
              {location.soon_count > 0 && <Pill tone="warn">{location.soon_count} to use soon</Pill>}
            </div>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground/50" aria-hidden />
      </Link>
    </div>
  );
}

function Pill({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-semibold", tone === "danger" ? "bg-danger-muted text-danger-foreground" : "bg-warn-muted text-warn-foreground")}>
      {children}
    </span>
  );
}
