"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  DoorOpen,
  EllipsisVertical,
  Minus,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { ExpiryChip } from "@/components/freshness";
import { ExpiryPicker, type ExpiryValue } from "@/components/expiry-picker";
import { ProductThumb } from "@/components/product-thumb";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  consumeEntry,
  consumeStock,
  deleteEntry,
  deleteProduct,
  setEntryOpened,
  updateEntry,
  updateProduct,
} from "@/lib/actions";
import { expiryStatus, formatDate, formatQty, pluralUnit } from "@/lib/dates";
import type { Location, Product, StockEntryDetail } from "@/lib/types";
import { UNITS } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProductScreen({
  product,
  entries,
  locations,
  soonDays,
  today,
}: {
  product: Product;
  entries: StockEntryDetail[];
  locations: Location[];
  soonDays: number;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeEntry, setActiveEntry] = useState<StockEntryDetail | null>(null);
  const [editingProduct, setEditingProduct] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const total = entries.reduce((sum, e) => sum + e.quantity, 0);
  const nextExpiry = entries.find((e) => e.expiry_date)?.expiry_date ?? null;
  const status = expiryStatus(nextExpiry, soonDays, today);

  function take(waste: boolean) {
    startTransition(async () => {
      const result = await consumeStock({
        productId: product.id,
        quantity: 1,
        waste,
      });
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(
        waste ? `Binned one ${product.name.toLowerCase()}` : `Took one out`,
      );
      router.refresh();
    });
  }

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-xl">
        <div className="safe-top" />
        <div className="flex items-center justify-between px-2 py-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="tap-scale flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setEditingProduct(true)}
            aria-label="Item settings"
            className="tap-scale flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <EllipsisVertical className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      <div className="flex items-center gap-4 px-4 pb-5 pt-1">
        <ProductThumb
          name={product.name}
          brand={product.brand}
          imageUrl={product.image_url}
          status={status}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.4rem] font-semibold leading-tight tracking-tight">
            {product.name}
          </h1>
          {product.brand && (
            <p className="mt-0.5 text-muted-foreground">{product.brand}</p>
          )}
          {product.barcode && (
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              {product.barcode}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-6 px-4">
        <Card className="gap-4 p-4">
          {total === 0 ? (
            <div className="py-2 text-center">
              <p className="text-lg font-semibold">All gone</p>
              <p className="mt-1 text-sm text-muted-foreground">
                You&apos;ve none of this left.
              </p>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-4xl font-semibold tabular-nums leading-none">
                {formatQty(total)}
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {pluralUnit(product.unit, total)} in your kitchen
                {nextExpiry && (
                  <>
                    {" · "}
                    <span className="whitespace-nowrap font-medium">
                      first goes off {formatDate(nextExpiry)}
                    </span>
                  </>
                )}
              </p>
            </div>
          )}

          {total > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="lg"
                className="h-12 rounded-xl text-base"
                disabled={pending}
                onClick={() => take(false)}
              >
                {pending ? <Spinner /> : <Minus className="size-4.5" aria-hidden />}
                Used one
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 rounded-xl text-base text-danger-foreground"
                disabled={pending}
                onClick={() => take(true)}
              >
                <Trash2 className="size-4.5" aria-hidden />
                Binned one
              </Button>
            </div>
          )}

          <Button
            asChild
            variant={total === 0 ? "default" : "ghost"}
            size="lg"
            className="h-12 rounded-xl text-base"
          >
            <Link href={`/add?product=${product.id}`}>
              <Plus className="size-4.5" aria-hidden />
              Add more of this
            </Link>
          </Button>
        </Card>

        {entries.length > 0 && (
          <section>
            <h2 className="mb-2.5 text-[1.05rem] font-semibold tracking-tight">
              Where it is
            </h2>
            <Card className="gap-0 overflow-hidden p-0">
              {entries.map((entry, i) => {
                const entryStatus = expiryStatus(entry.expiry_date, soonDays, today);
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setActiveEntry(entry)}
                    className={cn(
                      "tap-scale flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-muted/60",
                      i > 0 && "border-t",
                    )}
                  >
                    <span className="text-xl" aria-hidden>
                      {entry.location_emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium leading-tight">
                        {entry.location_name}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {formatQty(entry.quantity)}{" "}
                        {pluralUnit(product.unit, entry.quantity)}
                        {entry.opened_at && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs">
                            <DoorOpen className="size-3.5" aria-hidden /> opened
                          </span>
                        )}
                      </p>
                    </div>
                    <ExpiryChip
                      date={entry.expiry_date}
                      status={entryStatus}
                      today={today}
                    />
                  </button>
                );
              })}
            </Card>
            <p className="mt-2 px-1 text-xs text-muted-foreground">
              Tap a row to change the date, move it, or take some out.
            </p>
          </section>
        )}
      </div>

      {activeEntry && (
        <EntryDrawer
          key={activeEntry.id}
          entry={activeEntry}
          product={product}
          locations={locations}
          today={today}
          onClose={() => setActiveEntry(null)}
        />
      )}

      <ProductSettingsDrawer
        open={editingProduct}
        onOpenChange={setEditingProduct}
        product={product}
        locations={locations}
        onDelete={() => {
          setEditingProduct(false);
          setConfirmDelete(true);
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forget {product.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the item and everything you have of it. It can&apos;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteProduct(product.id);
                  if (!result.ok) { toast.error(result.error); return; }
                  toast.success(`Removed ${product.name}`);
                  router.push("/");
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EntryDrawer({
  entry,
  product,
  locations,
  today,
  onClose,
}: {
  entry: StockEntryDetail;
  product: Product;
  locations: Location[];
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState(entry.quantity);
  const [expiry, setExpiry] = useState<ExpiryValue>({
    date: entry.expiry_date,
    type: entry.date_type,
    precision: entry.date_precision,
  });
  const [locationId, setLocationId] = useState(entry.location_id);
  const [opened, setOpened] = useState(Boolean(entry.opened_at));
  const [takeAmount, setTakeAmount] = useState(1);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, message: string) {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) { toast.error(result.error ?? "Something went wrong"); return; }
      toast.success(message);
      router.refresh();
      onClose();
    });
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>
            {entry.location_emoji} {entry.location_name}
          </DrawerTitle>
          <DrawerDescription>
            {formatQty(entry.quantity)} {pluralUnit(product.unit, entry.quantity)} of{" "}
            {product.name}
          </DrawerDescription>
        </DrawerHeader>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <div className="space-y-5">
            <section className="rounded-2xl border bg-muted/40 p-3.5">
              <p className="mb-2.5 text-sm font-medium">Take some out</p>
              <QuantityStepper
                value={takeAmount}
                onChange={setTakeAmount}
                unit={product.unit}
                max={entry.quantity}
                size="sm"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  className="h-11 rounded-xl"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => consumeEntry({ entryId: entry.id, quantity: takeAmount }),
                      `Took ${formatQty(takeAmount)} out`,
                    )
                  }
                >
                  Used it
                </Button>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl text-danger-foreground"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () =>
                        consumeEntry({
                          entryId: entry.id,
                          quantity: takeAmount,
                          waste: true,
                        }),
                      `Binned ${formatQty(takeAmount)}`,
                    )
                  }
                >
                  Threw away
                </Button>
              </div>
            </section>

            <section>
              <Label className="mb-2 block">How much is there</Label>
              <QuantityStepper
                value={quantity}
                onChange={setQuantity}
                unit={product.unit}
                min={0}
                size="sm"
              />
            </section>

            <section>
              <Label className="mb-2 block">What the packet says</Label>
              <ExpiryPicker value={expiry} onChange={setExpiry} today={today} />
            </section>

            <section>
              <Label className="mb-2 block">Kept in</Label>
              <Select
                value={String(locationId)}
                onValueChange={(v) => setLocationId(Number(v))}
              >
                <SelectTrigger className="h-12 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.emoji} {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <label className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
              <span>
                <span className="block font-medium">Already opened</span>
                <span className="block text-sm text-muted-foreground">
                  Handy for jars and cartons
                </span>
              </span>
              <Switch checked={opened} onCheckedChange={setOpened} />
            </label>
          </div>
        </div>

        <DrawerFooter className="gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl text-base"
            disabled={pending}
            onClick={() =>
              run(async () => {
                if (opened !== Boolean(entry.opened_at)) {
                  await setEntryOpened({ entryId: entry.id, opened });
                }
                return updateEntry({
                  entryId: entry.id,
                  quantity,
                  expiryDate: expiry.date,
                  dateType: expiry.type,
                  datePrecision: expiry.precision,
                  locationId,
                });
              }, "Saved")
            }
          >
            {pending ? <Spinner /> : "Save changes"}
          </Button>
          <Button
            variant="ghost"
            className="h-11 rounded-xl text-danger-foreground"
            disabled={pending}
            onClick={() =>
              run(() => deleteEntry(entry.id), `Removed from ${entry.location_name}`)
            }
          >
            <Trash2 className="size-4" aria-hidden />
            Remove all of this
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ProductSettingsDrawer({
  open,
  onOpenChange,
  product,
  locations,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product;
  locations: Location[];
  onDelete: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [unit, setUnit] = useState(product.unit);
  const [defaultLocation, setDefaultLocation] = useState(
    product.default_location_id ? String(product.default_location_id) : "none",
  );
  const [dateType, setDateType] = useState(product.default_date_type ?? "none");
  const [minStock, setMinStock] = useState(String(product.min_stock ?? 0));

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Item settings</DrawerTitle>
          <DrawerDescription>
            These are used to fill in the form next time you scan it.
          </DrawerDescription>
        </DrawerHeader>

        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <div>
            <Label htmlFor="p-name" className="mb-1.5 block">
              Name
            </Label>
            <Input
              id="p-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl"
            />
          </div>
          <div>
            <Label htmlFor="p-brand" className="mb-1.5 block">
              Brand
            </Label>
            <Input
              id="p-brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Optional"
              className="h-12 rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 block">Counted in</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-12 w-full rounded-xl">
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
            <div>
              <Label className="mb-1.5 block">Usually says</Label>
              <Select value={dateType} onValueChange={setDateType}>
                <SelectTrigger className="h-12 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Ask me</SelectItem>
                  <SelectItem value="best_before">Best before</SelectItem>
                  <SelectItem value="use_by">Use by</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block">Usually kept in</Label>
            <Select value={defaultLocation} onValueChange={setDefaultLocation}>
              <SelectTrigger className="h-12 w-full rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No usual place</SelectItem>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={String(loc.id)}>
                    {loc.emoji} {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-min" className="mb-1.5 block">
              Tell me to buy more when there&apos;s this many left
            </Label>
            <Input
              id="p-min"
              type="number"
              inputMode="decimal"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className="h-12 rounded-xl"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Set to 0 to never be reminded.
            </p>
          </div>
        </div>

        <DrawerFooter className="gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl text-base"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await updateProduct({
                  id: product.id,
                  name,
                  brand: brand || null,
                  barcode: product.barcode,
                  unit,
                  defaultLocationId:
                    defaultLocation === "none" ? null : Number(defaultLocation),
                  defaultDateType:
                    dateType === "none" ? null : (dateType as "best_before" | "use_by"),
                  minStock: Number(minStock) || 0,
                });
                if (!result.ok) { toast.error(result.error); return; }
                toast.success("Saved");
                router.refresh();
                onOpenChange(false);
              })
            }
          >
            {pending ? <Spinner /> : "Save"}
          </Button>
          <Button
            variant="ghost"
            className="h-11 rounded-xl text-danger-foreground"
            onClick={onDelete}
          >
            <TriangleAlert className="size-4" aria-hidden />
            Delete this item completely
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
