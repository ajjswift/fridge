import Link from "next/link";
import {
  ArrowRightLeft,
  DoorOpen,
  Minus,
  PackagePlus,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { formatQty, formatRelativeTime, pluralUnit } from "@/lib/dates";
import { getActivity } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const KINDS = {
  add: { icon: PackagePlus, verb: "Put away", tone: "text-fresh-foreground bg-fresh-muted" },
  consume: { icon: Minus, verb: "Used", tone: "text-foreground bg-secondary" },
  waste: { icon: Trash2, verb: "Binned", tone: "text-danger-foreground bg-danger-muted" },
  move: { icon: ArrowRightLeft, verb: "Moved to", tone: "text-foreground bg-secondary" },
  open: { icon: DoorOpen, verb: "Opened", tone: "text-foreground bg-secondary" },
};

export default function ActivityPage() {
  const activity = getActivity(60);

  return (
    <div className="pb-6">
      <PageHeader
        title="Recent changes"
        subtitle="Everything that's gone in or out"
        backHref="/settings"
        compact
      />

      <div className="px-4">
        {activity.length === 0 ? (
          <Card className="items-center gap-3 p-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-4xl">
              📋
            </div>
            <p className="font-semibold">Nothing has happened yet</p>
            <p className="text-sm text-muted-foreground">
              Add or use something and it&apos;ll show up here.
            </p>
          </Card>
        ) : (
          <Card className="gap-0 overflow-hidden p-0">
            {activity.map((entry, i) => {
              const kind = KINDS[entry.kind as keyof typeof KINDS] ?? KINDS.consume;
              const Icon = kind.icon;
              const row = (
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3",
                    i > 0 && "border-t",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      kind.tone,
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate leading-tight">
                      <span className="font-medium">{kind.verb}</span>{" "}
                      {entry.quantity != null && entry.kind !== "move" && (
                        <span className="tabular-nums">
                          {formatQty(entry.quantity)}{" "}
                          {entry.unit
                            ? `${pluralUnit(entry.unit, entry.quantity)} of `
                            : ""}
                        </span>
                      )}
                      {entry.product_name}
                    </p>
                    {entry.location_name && (
                      <p className="truncate text-sm text-muted-foreground">
                        {entry.location_name}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </div>
              );

              return entry.product_id ? (
                <Link
                  key={entry.id}
                  href={`/products/${entry.product_id}`}
                  className="tap-scale block active:bg-muted/60"
                >
                  {row}
                </Link>
              ) : (
                <div key={entry.id}>{row}</div>
              );
            })}
          </Card>
        )}
      </div>
    </div>
  );
}
