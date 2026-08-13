"use client";

import { Check } from "lucide-react";
import type { Location } from "@/lib/types";
import { cn } from "@/lib/utils";

/** A grid of big emoji targets — easier to hit and to understand than a menu. */
export function LocationPicker({
  locations,
  value,
  onChange,
}: {
  locations: Location[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {locations.map((loc) => {
        const active = value === loc.id;
        return (
          <button
            key={loc.id}
            type="button"
            onClick={() => onChange(loc.id)}
            aria-pressed={active}
            className={cn(
              "tap-scale relative flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center",
              active
                ? "border-primary bg-primary/10 ring-2 ring-primary/40"
                : "bg-card",
            )}
          >
            {active && (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" strokeWidth={3} aria-hidden />
              </span>
            )}
            <span className="text-2xl leading-none" aria-hidden>
              {loc.emoji}
            </span>
            <span
              className={cn(
                "line-clamp-2 text-xs font-medium leading-tight",
                !active && "text-muted-foreground",
              )}
            >
              {loc.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
