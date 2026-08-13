"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Keyboard,
  Lightbulb,
  LightbulbOff,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ScanResultSheet, type ScanResult } from "@/components/scan-result-sheet";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { scanFeedback, useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { addStock } from "@/lib/actions";
import { formatQty, pluralUnit } from "@/lib/dates";
import type { Location } from "@/lib/types";
import { DEFAULT_UNIT } from "@/lib/types";
import { cn } from "@/lib/utils";

type SessionItem = { id: number; name: string; quantity: number; unit: string };

export function ScannerScreen({
  locations,
  initialLocationId,
  today,
}: {
  locations: Location[];
  initialLocationId: number | null;
  today: string;
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [locationId, setLocationId] = useState(initialLocationId);
  const [quickAdd, setQuickAdd] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [looking, setLooking] = useState(false);
  const [session, setSession] = useState<SessionItem[]>([]);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [typing, setTyping] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const location = locations.find((l) => l.id === locationId) ?? null;
  const busy = looking || result !== null || pickingLocation || typing;

  const handleBarcode = useCallback(
    async (barcode: string) => {
      scanFeedback();
      setLooking(true);
      try {
        const response = await fetch(
          `/api/lookup?barcode=${encodeURIComponent(barcode)}`,
        );
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Couldn't look that barcode up.");
        }
        const data = (await response.json()) as ScanResult;

        // Straight through only when the code itself carried a date. A remembered
        // shelf life would be a guess — the same milk can have a week or a month
        // left depending on what was on the shelf — so otherwise we ask.
        if (
          quickAdd &&
          data.source === "known" &&
          data.scannedDate &&
          locationId &&
          data.product
        ) {
          const outcome = await addStock({
            productId: data.product.id,
            name: data.product.name,
            brand: data.product.brand ?? null,
            barcode: data.barcode,
            unit: data.product.unit ?? DEFAULT_UNIT,
            locationId,
            quantity: 1,
            expiryDate: data.scannedDate.iso,
            dateType: data.scannedDate.type,
            datePrecision: data.scannedDate.precision,
          });
          if (outcome.ok) {
            setSession((s) => [
              {
                id: Date.now(),
                name: outcome.data.productName,
                quantity: 1,
                unit: data.product?.unit ?? DEFAULT_UNIT,
              },
              ...s,
            ]);
            toast.success(`${outcome.data.productName} → ${location?.name}${outcome.data.removedShoppingItem ? ` · removed ${outcome.data.removedShoppingItem} from shopping` : ""}`, {
              duration: 1600,
            });
            router.refresh();
            return;
          }
          toast.error(outcome.error);
        }

        setResult(data);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Couldn't look that barcode up.",
        );
      } finally {
        setLooking(false);
      }
    },
    [quickAdd, locationId, location, router],
  );

  const scanner = useBarcodeScanner({
    videoRef,
    active: !busy,
    onDetect: handleBarcode,
  });

  const cameraBroken =
    scanner.status === "denied" ||
    scanner.status === "insecure" ||
    scanner.status === "unavailable" ||
    scanner.status === "error";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <video
        ref={videoRef}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-500",
          scanner.status === "running" ? "opacity-100" : "opacity-0",
        )}
        playsInline
        muted
        autoPlay
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80" />

      {/* ---------------------------------------------------------- top bar */}
      <div className="relative safe-top" />
      <div className="relative flex items-center justify-between gap-2 px-3 py-2">
        <Link
          href="/"
          aria-label="Close the scanner"
          className="tap-scale flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur"
        >
          <X className="size-5" aria-hidden />
        </Link>

        <button
          type="button"
          onClick={() => setPickingLocation(true)}
          className="tap-scale flex min-w-0 items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-medium backdrop-blur"
        >
          <span className="text-base leading-none" aria-hidden>
            {location?.emoji ?? "📦"}
          </span>
          <span className="truncate">
            Into the {location?.name.toLowerCase() ?? "kitchen"}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-70" aria-hidden />
        </button>

        {scanner.torchAvailable ? (
          <button
            type="button"
            onClick={scanner.toggleTorch}
            aria-label={scanner.torchOn ? "Turn the light off" : "Turn the light on"}
            aria-pressed={scanner.torchOn}
            className={cn(
              "tap-scale flex size-10 items-center justify-center rounded-full backdrop-blur",
              scanner.torchOn ? "bg-white text-black" : "bg-white/15",
            )}
          >
            {scanner.torchOn ? (
              <Lightbulb className="size-5" aria-hidden />
            ) : (
              <LightbulbOff className="size-5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="size-10" />
        )}
      </div>

      {/* ------------------------------------------------------- viewfinder */}
      <div className="relative flex flex-1 flex-col items-center justify-center px-8">
        {cameraBroken ? (
          <CameraProblem
            status={scanner.status}
            message={scanner.error}
            onType={() => setTyping(true)}
          />
        ) : (
          <>
            <div className="relative aspect-[5/3] w-full max-w-xs">
              <Corner className="left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl" />
              <Corner className="right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl" />
              <Corner className="bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl" />
              <Corner className="bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl" />
              {scanner.status === "running" && !busy && (
                <div className="absolute inset-x-6 top-1/2 h-0.5 -translate-y-1/2 animate-scanline rounded-full bg-primary shadow-[0_0_14px_2px] shadow-primary/70" />
              )}
              {looking && (
                <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 backdrop-blur-sm">
                  <Spinner className="size-7" />
                </div>
              )}
            </div>

            <p className="mt-6 text-center text-[0.95rem] font-medium text-white/85">
              {scanner.status === "starting"
                ? "Starting the camera…"
                : looking
                  ? "Looking it up…"
                  : "Point at the barcode"}
            </p>
            <p className="mt-1 text-center text-sm text-white/50">
              Hold it about 15cm away
            </p>
          </>
        )}
      </div>

      {/* ------------------------------------------------------- bottom bar */}
      <div className="relative px-4 pb-2">
        {session.length > 0 && (
          <div className="mb-3 rounded-2xl bg-white/10 p-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">
                {session.length} put away
                {location ? ` in the ${location.name.toLowerCase()}` : ""}
              </p>
              <Link
                href={location ? `/locations/${location.id}` : "/"}
                className="text-sm font-medium text-primary"
              >
                View
              </Link>
            </div>
            <ul className="no-scrollbar max-h-24 space-y-1 overflow-y-auto">
              {session.slice(0, 6).map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 text-sm text-white/80"
                >
                  <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{item.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-white/50">
                    {formatQty(item.quantity)} {pluralUnit(item.unit, item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="mb-2 flex items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-3 backdrop-blur">
          <Zap
            className={cn("size-5 shrink-0", quickAdd ? "text-primary" : "text-white/50")}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Fast mode</span>
            <span className="block text-xs text-white/60">
              For things you&apos;ve had before, just asks how long they&apos;ve got
            </span>
          </span>
          <Switch checked={quickAdd} onCheckedChange={setQuickAdd} />
        </label>

        <Button
          variant="secondary"
          size="lg"
          className="h-12 w-full rounded-2xl border-0 bg-white/15 text-base text-white backdrop-blur hover:bg-white/25"
          onClick={() => setTyping(true)}
        >
          <Keyboard className="size-4.5" aria-hidden />
          Type the numbers instead
        </Button>
      </div>
      <div className="relative safe-bottom" />

      {/* ------------------------------------------------------------ modals */}
      {result && locationId && (
        <ScanResultSheet
          result={result}
          locations={locations}
          locationId={locationId}
          onLocationChange={setLocationId}
          today={today}
          quick={quickAdd}
          onClose={() => setResult(null)}
          onAdded={(item) => {
            setSession((s) => [{ id: Date.now(), ...item }, ...s]);
            setResult(null);
            router.refresh();
          }}
        />
      )}

      <Drawer open={pickingLocation} onOpenChange={setPickingLocation}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Where are you putting things?</DrawerTitle>
            <DrawerDescription>
              Everything you scan goes here until you change it.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 px-4 pb-4">
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setLocationId(loc.id);
                  setPickingLocation(false);
                }}
                className={cn(
                  "tap-scale flex items-center gap-3 rounded-2xl border p-3.5 text-left",
                  loc.id === locationId && "border-primary bg-primary/10",
                )}
              >
                <span className="text-2xl" aria-hidden>
                  {loc.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{loc.name}</span>
                  {loc.description && (
                    <span className="block truncate text-sm text-muted-foreground">
                      {loc.description}
                    </span>
                  )}
                </span>
                {loc.id === locationId && (
                  <Check className="size-5 shrink-0 text-primary" aria-hidden />
                )}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={typing} onOpenChange={setTyping}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>Type the barcode</DrawerTitle>
            <DrawerDescription>
              The long number under the black lines.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4">
            <Input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              autoFocus
              placeholder="5000000000000"
              aria-label="Barcode number"
              className="h-14 rounded-xl text-center font-mono text-lg tracking-widest"
            />
          </div>
          <DrawerFooter className="gap-2">
            <Button
              size="lg"
              className="h-12 rounded-xl text-base"
              disabled={manualCode.length < 6}
              onClick={() => {
                const code = manualCode;
                setManualCode("");
                setTyping(false);
                void handleBarcode(code);
              }}
            >
              Look it up
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-xl">
              <Link href={locationId ? `/add?location=${locationId}` : "/add"}>
                It has no barcode — add it by hand
              </Link>
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn("absolute size-9 border-white/85", className)}
    />
  );
}

function CameraProblem({
  status,
  message,
  onType,
}: {
  status: string;
  message: string | null;
  onType: () => void;
}) {
  const advice =
    status === "insecure"
      ? "Open the app over https, or use localhost on this device. Cameras are blocked on plain http for safety."
      : status === "denied"
        ? "Allow camera access for this site in your browser settings, then come back."
        : "You can still add things by typing the barcode or filling in the form.";

  return (
    <div className="w-full max-w-xs rounded-3xl bg-white/10 p-6 text-center backdrop-blur">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white/15 text-3xl">
        📷
      </div>
      <p className="mt-4 font-semibold">{message ?? "The camera isn't available"}</p>
      <p className="mt-1.5 text-sm text-white/70">{advice}</p>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          size="lg"
          className="h-12 rounded-xl text-base"
          onClick={onType}
        >
          <Keyboard className="size-4.5" aria-hidden />
          Type the barcode
        </Button>
        <Button
          asChild
          variant="secondary"
          size="lg"
          className="h-12 rounded-xl border-0 bg-white/15 text-base text-white hover:bg-white/25"
        >
          <Link href="/add">Add without a barcode</Link>
        </Button>
      </div>
    </div>
  );
}
