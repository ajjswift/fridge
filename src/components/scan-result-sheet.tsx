"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Globe, SlidersHorizontal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ExpiryPicker, type ExpiryValue } from "@/components/expiry-picker";
import { ProductThumb } from "@/components/product-thumb";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addStock } from "@/lib/actions";
import { addDaysISO, endOfMonthISO } from "@/lib/dates";
import {
  DATE_TYPE_LABEL,
  DEFAULT_UNIT,
  type DatePrecision,
  type DateType,
  type Location,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export type ScanResult = {
  source: "known" | "openfoodfacts" | "unknown";
  barcode: string;
  /** Every external barcode provider was unavailable, rather than missing this code. */
  lookupUnavailable?: boolean;
  /** Present only when the scan was a GS1 code that carried a date. */
  scannedDate?: { iso: string; precision: DatePrecision; type: DateType } | null;
  product?: {
    id: number | null;
    name: string;
    brand?: string | null;
    imageUrl?: string | null;
    unit?: string;
    defaultLocationId?: number | null;
    defaultDateType?: DateType | null;
    minStock?: number;
    category?: string | null;
    packSize?: string | null;
  };
};

const SOURCE_BADGE = {
  known: {
    icon: CircleCheck,
    text: "You've had this before",
    className: "bg-fresh-muted text-fresh-foreground",
  },
  openfoodfacts: {
    icon: Globe,
    text: "Found in the food database",
    className: "bg-accent text-accent-foreground",
  },
  unknown: {
    icon: Sparkles,
    text: "New — what is it?",
    className: "bg-warn-muted text-warn-foreground",
  },
};

/** Big one-tap targets for the fast path. */
const QUICK_DATES = [
  { days: 2, label: "2 days" },
  { days: 5, label: "5 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
  { days: 90, label: "3 months" },
  { days: 180, label: "6 months" },
  { days: 365, label: "1 year" },
];

export function ScanResultSheet({
  result,
  locations,
  locationId,
  onLocationChange,
  today,
  quick,
  onClose,
  onAdded,
}: {
  result: ScanResult;
  locations: Location[];
  locationId: number;
  onLocationChange: (id: number) => void;
  today: string;
  /** Known product in fast mode: ask for the date and nothing else. */
  quick: boolean;
  onClose: () => void;
  onAdded: (item: { name: string; quantity: number; unit: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const product = result.product;

  const [name, setName] = useState(product?.name ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [quantity, setQuantity] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryValue>({
    date: result.scannedDate?.iso ?? null,
    precision: result.scannedDate?.precision ?? "day",
    type: result.scannedDate?.type ?? product?.defaultDateType ?? "best_before",
  });

  const unit = product?.unit ?? DEFAULT_UNIT;
  const badge = SOURCE_BADGE[result.source];
  const BadgeIcon = badge.icon;
  const location = locations.find((l) => l.id === locationId);
  const known = result.source === "known";
  const showQuick = quick && known && !expanded;

  function save(override?: ExpiryValue) {
    const value = override ?? expiry;
    if (!name.trim()) {
      toast.error("Give it a name first.");
      return;
    }
    startTransition(async () => {
      const outcome = await addStock({
        productId: product?.id ?? null,
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: result.barcode,
        imageUrl: product?.imageUrl ?? null,
        category: product?.category ?? null,
        unit,
        locationId,
        quantity,
        expiryDate: value.date,
        dateType: value.type,
        datePrecision: value.precision,
      });
      if (!outcome.ok) {
        toast.error(outcome.error);
        return;
      }
      toast.success(`${outcome.data.productName} → ${location?.name}${outcome.data.removedShoppingItem ? ` · removed ${outcome.data.removedShoppingItem} from shopping` : ""}`, {
        duration: 1600,
      });
      onAdded({ name: outcome.data.productName, quantity, unit });
    });
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="pb-2 text-left">
          <span
            className={cn(
              "mb-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              badge.className,
            )}
          >
            <BadgeIcon className="size-3.5" aria-hidden />
            {badge.text}
          </span>
          <DrawerTitle className="sr-only">Add a scanned item</DrawerTitle>

          <div className="flex items-center gap-3.5">
            <ProductThumb
              name={name}
              brand={brand}
              imageUrl={product?.imageUrl}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              {known ? (
                <>
                  <p className="truncate text-lg font-semibold leading-tight">{name}</p>
                  {brand && (
                    <p className="truncate text-sm text-muted-foreground">{brand}</p>
                  )}
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {result.barcode}
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What is it?"
                    aria-label="Item name"
                    autoFocus={!name}
                    className="h-11 rounded-xl font-medium"
                  />
                  <Input
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="Brand (optional)"
                    aria-label="Brand"
                    className="h-10 rounded-xl text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          {result.lookupUnavailable && (
            <p className="mt-3 rounded-xl bg-warn-muted px-3 py-2 text-sm text-warn-foreground">
              Product lookup is temporarily unavailable. You can still add it manually.
            </p>
          )}
        </DrawerHeader>

        {showQuick ? (
          <QuickDates
            initialType={expiry.type}
            pending={pending}
            locationName={location?.name}
            today={today}
            onPick={(value) => {
              setExpiry(value);
              save(value);
            }}
            onExpand={() => setExpanded(true)}
          />
        ) : (
          <>
            <div className="no-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pt-2">
              <section>
                <Label className="mb-2 block text-[0.95rem] font-semibold">
                  How many?
                </Label>
                <QuantityStepper value={quantity} onChange={setQuantity} unit={unit} />
              </section>

              <section>
                <Label className="mb-2 block text-[0.95rem] font-semibold">
                  What does the packet say?
                </Label>
                <ExpiryPicker
                  value={expiry}
                  onChange={setExpiry}
                  today={today}
                  fromBarcode={Boolean(result.scannedDate)}
                />
              </section>

              <section>
                <Label className="mb-2 block text-[0.95rem] font-semibold">Goes in</Label>
                <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
                  {locations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => onLocationChange(loc.id)}
                      aria-pressed={loc.id === locationId}
                      className={cn(
                        "tap-scale flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium",
                        loc.id === locationId
                          ? "bg-primary text-primary-foreground"
                          : "border bg-card",
                      )}
                    >
                      <span aria-hidden>{loc.emoji}</span>
                      {loc.name}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <DrawerFooter className="gap-2">
              <Button
                size="lg"
                className="h-14 rounded-2xl text-base"
                disabled={pending}
                onClick={() => save()}
              >
                {pending ? (
                  <Spinner />
                ) : (
                  `Put in the ${location?.name.toLowerCase() ?? "kitchen"}`
                )}
              </Button>
              <Button asChild variant="ghost" className="h-11 rounded-xl">
                <Link
                  href={`/add?barcode=${encodeURIComponent(result.barcode)}&location=${locationId}`}
                >
                  More options
                </Link>
              </Button>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * The fast path for putting shopping away. The product is already known, so the
 * only thing that genuinely changes between purchases is the date — one tap
 * files it and hands the camera straight back.
 */
function QuickDates({
  initialType,
  pending,
  locationName,
  today,
  onPick,
  onExpand,
}: {
  initialType: DateType;
  pending: boolean;
  locationName?: string;
  today: string;
  onPick: (value: ExpiryValue) => void;
  onExpand: () => void;
}) {
  const [type, setType] = useState<DateType>(initialType);

  return (
    <>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pt-1">
        <div
          role="group"
          aria-label="What the packet says"
          className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
        >
          {(["best_before", "use_by"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              aria-pressed={type === option}
              className={cn(
                "tap-scale rounded-lg px-3 py-2 text-sm font-medium",
                type === option ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {DATE_TYPE_LABEL[option]}
            </button>
          ))}
        </div>

        <p className="mb-2 text-sm text-muted-foreground">
          How long has it got? One tap and it&apos;s away.
        </p>

        <div className="grid grid-cols-2 gap-2 pb-2">
          {QUICK_DATES.map((option) => (
            <button
              key={option.days}
              type="button"
              disabled={pending}
              onClick={() =>
                onPick({
                  // Anything half a year out is realistically printed as a
                  // month on the packet, so store it at that precision.
                  date:
                    option.days >= 180
                      ? endOfMonthISO(addDaysISO(option.days, today))
                      : addDaysISO(option.days, today),
                  precision: option.days >= 180 ? "month" : "day",
                  type,
                })
              }
              className="tap-scale rounded-xl border bg-card py-3.5 text-base font-medium disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() => onPick({ date: null, precision: "day", type })}
          className="tap-scale mb-2 w-full rounded-xl border border-dashed py-3 text-sm font-medium text-muted-foreground disabled:opacity-50"
        >
          No date on it
        </button>
      </div>

      <DrawerFooter className="gap-2">
        {pending && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            Putting it in the {locationName?.toLowerCase() ?? "kitchen"}…
          </div>
        )}
        <Button
          variant="ghost"
          className="h-11 rounded-xl"
          disabled={pending}
          onClick={onExpand}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Exact date, amount or place
        </Button>
      </DrawerFooter>
    </>
  );
}
