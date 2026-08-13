import {
  CircleAlert,
  CircleCheck,
  Clock,
  Infinity as InfinityIcon,
  OctagonAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { expiryPhrase } from "@/lib/dates";
import type { DatePrecision, DateType, ExpiryStatus } from "@/lib/types";

export const FRESHNESS = {
  expired: {
    chip: "bg-danger-muted text-danger-foreground",
    dot: "bg-danger",
    text: "text-danger-foreground",
    ring: "ring-danger/35",
    icon: CircleAlert,
    word: "Out of date",
  },
  soon: {
    chip: "bg-warn-muted text-warn-foreground",
    dot: "bg-warn",
    text: "text-warn-foreground",
    ring: "ring-warn/35",
    icon: Clock,
    word: "Use soon",
  },
  fresh: {
    chip: "bg-fresh-muted text-fresh-foreground",
    dot: "bg-fresh",
    text: "text-fresh-foreground",
    ring: "ring-fresh/25",
    icon: CircleCheck,
    word: "Fresh",
  },
  none: {
    chip: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground",
    ring: "ring-border",
    icon: InfinityIcon,
    word: "No date",
  },
} satisfies Record<ExpiryStatus, unknown> as Record<
  ExpiryStatus,
  {
    chip: string;
    dot: string;
    text: string;
    ring: string;
    icon: typeof CircleAlert;
    word: string;
  }
>;

/**
 * Red is reserved for a passed use-by, where eating it is genuinely a bad idea.
 * A passed best-before is amber: it's a quality date, and treating it as a
 * safety one is how food gets binned for no reason.
 */
export function expiredStyle(type: DateType) {
  return type === "use_by"
    ? { chip: FRESHNESS.expired.chip, icon: OctagonAlert, ring: FRESHNESS.expired.ring }
    : { chip: FRESHNESS.soon.chip, icon: CircleAlert, ring: FRESHNESS.soon.ring };
}

export function ExpiryChip({
  date,
  status,
  today,
  type = "best_before",
  precision = "day",
  className,
  showIcon = true,
}: {
  date: string | null;
  status: ExpiryStatus;
  today: string;
  type?: DateType;
  precision?: DatePrecision;
  className?: string;
  showIcon?: boolean;
}) {
  const expired = status === "expired";
  const style = expired ? expiredStyle(type) : FRESHNESS[status];
  const Icon = style.icon;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        style.chip,
        className,
      )}
    >
      {showIcon && <Icon className="size-3.5" aria-hidden />}
      {status !== "none" && (
        <span className="sr-only">
          {type === "use_by" ? "Use by" : "Best before"}
        </span>
      )}
      {expiryPhrase(date, precision, today)}
    </span>
  );
}

/** The ring colour around a product thumbnail. */
export function ringFor(status: ExpiryStatus, type: DateType): string {
  return status === "expired" ? expiredStyle(type).ring : FRESHNESS[status].ring;
}
