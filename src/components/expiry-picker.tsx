"use client";

import { CalendarDays, Infinity as InfinityIcon, ScanBarcode } from "lucide-react";
import {
  addDaysISO,
  endOfMonthISO,
  expiryLabel,
  formatDateLong,
  fromMonthValue,
  toMonthValue,
  todayISO,
} from "@/lib/dates";
import {
  DATE_TYPE_HELP,
  DATE_TYPE_LABEL,
  type DatePrecision,
  type DateType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const PRESETS = [
  { days: 2, label: "2 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 365, label: "1 year" },
];

export type ExpiryValue = {
  date: string | null;
  type: DateType;
  precision: DatePrecision;
};

/**
 * Typing a date on a phone is miserable, so the common answers are one tap and
 * the exact field is there for when the packet says something specific. Month
 * precision matters because plenty of packaging only prints "09/2026".
 */
export function ExpiryPicker({
  value,
  onChange,
  today = todayISO(),
  /** Set when the date came off a GS1 barcode rather than being typed. */
  fromBarcode = false,
}: {
  value: ExpiryValue;
  onChange: (next: ExpiryValue) => void;
  today?: string;
  fromBarcode?: boolean;
}) {
  const { date, type, precision } = value;

  function setDate(next: string | null, nextPrecision: DatePrecision = "day") {
    onChange({ ...value, date: next, precision: next ? nextPrecision : "day" });
  }

  return (
    <div className="space-y-3">
      {/* What kind of date is it — the single most useful thing to know. */}
      <div>
        <div
          role="group"
          aria-label="What the packet says"
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
        >
          {(["best_before", "use_by"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange({ ...value, type: option })}
              aria-pressed={type === option}
              disabled={!date}
              className={cn(
                "tap-scale rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                type === option && date
                  ? "bg-card shadow-sm"
                  : "text-muted-foreground",
                !date && "opacity-50",
              )}
            >
              {DATE_TYPE_LABEL[option]}
            </button>
          ))}
        </div>
        {date && (
          <p className="mt-1.5 px-1 text-xs text-muted-foreground">
            {DATE_TYPE_HELP[type]}
          </p>
        )}
      </div>

      {fromBarcode && (
        <p className="flex items-center gap-1.5 rounded-xl bg-fresh-muted px-3 py-2 text-xs font-medium text-fresh-foreground">
          <ScanBarcode className="size-3.5 shrink-0" aria-hidden />
          Read straight off the barcode — change it if it&apos;s wrong.
        </p>
      )}

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {PRESETS.map((preset) => {
          const iso = addDaysISO(preset.days, today);
          const active = date === iso && precision === "day";
          return (
            <button
              key={preset.days}
              type="button"
              onClick={() => setDate(iso)}
              aria-pressed={active}
              className={cn(
                "tap-scale shrink-0 rounded-full px-3.5 py-2 text-sm font-medium",
                active
                  ? "bg-primary text-primary-foreground"
                  : "border bg-card text-foreground",
              )}
            >
              {preset.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDate(null)}
          aria-pressed={date === null}
          className={cn(
            "tap-scale flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium",
            date === null
              ? "bg-primary text-primary-foreground"
              : "border bg-card text-foreground",
          )}
        >
          <InfinityIcon className="size-4" aria-hidden />
          No date
        </button>
      </div>

      {/* Exact vs month-only. Native inputs give the right keyboard and picker
          on a phone, including a month wheel for type="month". */}
      <div className="rounded-xl border bg-card">
        <div
          role="group"
          aria-label="How precise is the date"
          className="flex border-b"
        >
          <PrecisionTab
            active={precision === "day"}
            onClick={() => {
              if (precision === "day") return;
              setDate(date ?? addDaysISO(7, today), "day");
            }}
          >
            Exact date
          </PrecisionTab>
          <PrecisionTab
            active={precision === "month"}
            onClick={() => {
              if (precision === "month") return;
              const base = date ?? addDaysISO(30, today);
              setDate(endOfMonthISO(base), "month");
            }}
          >
            Month only
          </PrecisionTab>
        </div>

        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <CalendarDays className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
          {precision === "month" ? (
            <input
              type="month"
              value={date ? toMonthValue(date) : ""}
              onChange={(e) =>
                setDate(e.target.value ? fromMonthValue(e.target.value) : null, "month")
              }
              aria-label="Month and year on the packet"
              className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
            />
          ) : (
            <input
              type="date"
              value={date ?? ""}
              onChange={(e) => setDate(e.target.value || null, "day")}
              aria-label="Exact date on the packet"
              className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none"
            />
          )}
          {date && precision === "day" && (
            <span className="shrink-0 text-sm font-medium text-muted-foreground">
              {expiryLabel(date, today)}
            </span>
          )}
        </div>
      </div>

      {date && (
        <p className="text-xs text-muted-foreground">
          {DATE_TYPE_LABEL[type]}{" "}
          {precision === "month"
            ? `end of ${formatDateLong(date, "month")}`
            : formatDateLong(date)}
          .
        </p>
      )}
    </div>
  );
}

function PrecisionTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex-1 px-3 py-2 text-sm font-medium transition-colors first:rounded-tl-xl last:rounded-tr-xl",
        active ? "bg-muted/70 text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}
