"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ScanBarcode } from "lucide-react";
import { toast } from "sonner";
import { ExpiryPicker, type ExpiryValue } from "@/components/expiry-picker";
import { LocationPicker } from "@/components/location-picker";
import { ProductThumb } from "@/components/product-thumb";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addStock } from "@/lib/actions";
import type { DatePrecision, DateType, Location } from "@/lib/types";
import { UNITS } from "@/lib/types";

export type AddPreset = {
  productId: number | null;
  name: string;
  brand: string;
  imageUrl: string | null;
  category: string | null;
  unit: string;
  barcode: string | null;
  /** Whether this product carries a use-by or a best-before, if we know. */
  defaultDateType: DateType | null;
  /** A date read off a GS1 barcode, when the code carried one. */
  scannedDate: { iso: string; precision: DatePrecision; type: DateType } | null;
  minStock: number;
  locationId: number | null;
};

export function AddItemForm({
  locations,
  preset,
  today,
}: {
  locations: Location[];
  preset: AddPreset;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(preset.name);
  const [brand, setBrand] = useState(preset.brand);
  const [unit, setUnit] = useState(preset.unit);
  const [quantity, setQuantity] = useState(1);
  const [locationId, setLocationId] = useState<number | null>(preset.locationId);
  // Never prefilled from a previous purchase: the same milk can have a week or
  // a month left depending on what was on the shelf. Only a date read off the
  // barcode itself is trustworthy enough to fill in.
  const [expiry, setExpiry] = useState<ExpiryValue>({
    date: preset.scannedDate?.iso ?? null,
    precision: preset.scannedDate?.precision ?? "day",
    type: preset.scannedDate?.type ?? preset.defaultDateType ?? "best_before",
  });
  const [showMore, setShowMore] = useState(false);
  const [minStock, setMinStock] = useState(String(preset.minStock || 0));

  const locationName =
    locations.find((l) => l.id === locationId)?.name.toLowerCase() ?? "the kitchen";

  function submit() {
    if (!name.trim()) { toast.error("What is it? Give it a name."); return; }
    if (!locationId) { toast.error("Pick where it goes."); return; }

    startTransition(async () => {
      const result = await addStock({
        productId: preset.productId,
        name: name.trim(),
        brand: brand.trim() || null,
        barcode: preset.barcode,
        imageUrl: preset.imageUrl,
        category: preset.category,
        unit,
        locationId,
        quantity,
        expiryDate: expiry.date,
        dateType: expiry.type,
        datePrecision: expiry.precision,
        minStock: Number(minStock) || 0,
      });

      if (!result.ok) { toast.error(result.error); return; }
      toast.success(`${result.data.productName} put in the ${locationName}`);
      router.push(`/locations/${locationId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 px-4 pb-24">
      <div className="flex items-center gap-3.5 rounded-2xl border bg-card p-3.5">
        <ProductThumb
          name={name}
          brand={brand}
          imageUrl={preset.imageUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <Label htmlFor="name" className="sr-only">
              What is it
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What is it?"
              autoFocus={!name}
              className="h-11 rounded-xl font-medium"
            />
          </div>
          <Input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="Brand (optional)"
            aria-label="Brand"
            className="h-10 rounded-xl text-sm"
          />
        </div>
      </div>

      {preset.barcode && (
        <p className="-mt-3 flex items-center gap-1.5 px-1 font-mono text-xs text-muted-foreground">
          <ScanBarcode className="size-3.5" aria-hidden />
          {preset.barcode}
        </p>
      )}

      <section>
        <Label className="mb-2.5 block text-[0.95rem] font-semibold">
          Where does it go?
        </Label>
        <LocationPicker
          locations={locations}
          value={locationId}
          onChange={setLocationId}
        />
      </section>

      <section>
        <Label className="mb-2.5 block text-[0.95rem] font-semibold">How many?</Label>
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
          <QuantityStepper
            value={quantity}
            onChange={setQuantity}
            unit={unit}
            className="flex-1"
          />
          <Select value={unit} onValueChange={setUnit}>
            <SelectTrigger className="h-12 w-28 rounded-xl" aria-label="Counted in">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section>
        <Label className="mb-2.5 block text-[0.95rem] font-semibold">
          When does it go off?
        </Label>
        <ExpiryPicker
          value={expiry}
          onChange={setExpiry}
          today={today}
          fromBarcode={Boolean(preset.scannedDate)}
        />
      </section>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-medium text-muted-foreground"
          aria-expanded={showMore}
        >
          More options
          <ChevronDown
            className={`size-4 transition-transform ${showMore ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
        {showMore && (
          <div className="animate-pop-in rounded-2xl border bg-card p-3.5">
            <Label htmlFor="min-stock" className="mb-1.5 block">
              Add to the shopping list when only this many are left
            </Label>
            <Input
              id="min-stock"
              type="number"
              inputMode="decimal"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className="h-12 rounded-xl"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Leave at 0 if you don&apos;t want reminders.
            </p>
          </div>
        )}
      </div>

      {/* Pinned above the tab bar so the main action is always in thumb reach. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 mx-auto w-full max-w-md bg-gradient-to-t from-background via-background to-transparent px-4 pb-3 pt-6">
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-base shadow-lg shadow-primary/20"
          disabled={pending}
          onClick={submit}
        >
          {pending ? <Spinner /> : `Put in the ${locationName}`}
        </Button>
      </div>
    </div>
  );
}
