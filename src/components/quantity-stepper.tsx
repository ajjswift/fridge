"use client";

import { Minus, Plus } from "lucide-react";
import { formatQty, pluralUnit } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  unit,
  min = 1,
  max = 999,
  step = 1,
  size = "md",
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, Number(n.toFixed(2))));
  const button =
    size === "sm"
      ? "size-9 rounded-lg"
      : "size-12 rounded-xl";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        aria-label="One less"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - step))}
        className={cn(
          "tap-scale flex shrink-0 items-center justify-center border bg-card text-foreground disabled:opacity-35",
          button,
        )}
      >
        <Minus className="size-5" aria-hidden />
      </button>

      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center",
          size === "sm" && "min-w-14",
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "font-semibold tabular-nums leading-none",
            size === "sm" ? "text-lg" : "text-2xl",
          )}
        >
          {formatQty(value)}
        </span>
        {unit && (
          <span className="mt-0.5 text-xs text-muted-foreground">
            {pluralUnit(unit, value)}
          </span>
        )}
      </div>

      <button
        type="button"
        aria-label="One more"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + step))}
        className={cn(
          "tap-scale flex shrink-0 items-center justify-center border bg-card text-foreground disabled:opacity-35",
          button,
        )}
      >
        <Plus className="size-5" aria-hidden />
      </button>
    </div>
  );
}
