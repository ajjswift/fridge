import Link from "next/link";
import { ChevronRight, DoorOpen } from "lucide-react";
import { ExpiryChip } from "@/components/freshness";
import { ProductThumb } from "@/components/product-thumb";
import { expiryStatus, formatQty, pluralUnit } from "@/lib/dates";
import type { DatePrecision, DateType } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  productId: number;
  name: string;
  brand?: string | null;
  imageUrl?: string | null;
  quantity: number;
  unit: string;
  expiry: string | null;
  dateType?: DateType;
  datePrecision?: DatePrecision;
  today: string;
  soonDays: number;
  /** Shown when a row can come from more than one place. */
  locationLabel?: string | null;
  opened?: boolean;
  entryCount?: number;
  className?: string;
};

export function StockRow({
  productId,
  name,
  brand,
  imageUrl,
  quantity,
  unit,
  expiry,
  dateType = "best_before",
  datePrecision = "day",
  today,
  soonDays,
  locationLabel,
  opened,
  entryCount,
  className,
}: Props) {
  const status = expiryStatus(expiry, soonDays, today);

  return (
    <Link
      href={`/products/${productId}`}
      className={cn(
        "tap-scale flex items-center gap-3 px-4 py-3 active:bg-muted/60",
        className,
      )}
    >
      <ProductThumb
        name={name}
        brand={brand}
        imageUrl={imageUrl}
        status={status}
        dateType={dateType}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium leading-tight">{name}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="shrink-0 whitespace-nowrap font-medium tabular-nums text-foreground/75">
            {formatQty(quantity)} {pluralUnit(unit, quantity)}
          </span>
          {(locationLabel || brand) && (
            <>
              <span className="shrink-0" aria-hidden>
                ·
              </span>
              <span className="truncate">{locationLabel ?? brand}</span>
            </>
          )}
          {opened && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-xs">
              <DoorOpen className="size-3.5" aria-hidden />
              open
            </span>
          )}
        </div>
        {entryCount && entryCount > 1 ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {entryCount} different dates
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ExpiryChip
          date={expiry}
          status={status}
          today={today}
          type={dateType}
          precision={datePrecision}
        />
        <ChevronRight className="size-4 text-muted-foreground/50" aria-hidden />
      </div>
    </Link>
  );
}
