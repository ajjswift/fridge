"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  createLocation,
  deleteLocation,
  reorderLocations,
  updateLocation,
} from "@/lib/actions";
import type { LocationSummary } from "@/lib/types";

const EMOJI_CHOICES = [
  "🧊", "❄️", "🥫", "🍪", "🥦", "🧃", "🍞", "🧂", "🍷",
  "🥔", "🧺", "🚪", "📦", "🏠", "🍫", "☕", "🧀", "🥚",
];

type Editing = { mode: "new" } | { mode: "edit"; location: LocationSummary };

export function LocationManager({
  locations,
  autoOpenNew = false,
}: {
  locations: LocationSummary[];
  autoOpenNew?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing | null>(
    autoOpenNew ? { mode: "new" } : null,
  );

  function move(index: number, direction: -1 | 1) {
    const next = [...locations];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    startTransition(async () => {
      const result = await reorderLocations(next.map((l) => l.id));
      if (!result.ok) { toast.error(result.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 px-4">
      <Card className="gap-0 overflow-hidden p-0">
        {locations.map((loc, i) => (
          <div
            key={loc.id}
            className={`flex items-center gap-3 px-3 py-3 ${i > 0 ? "border-t" : ""}`}
          >
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${loc.name} up`}
                className="tap-scale flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-25"
              >
                <ChevronUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === locations.length - 1}
                aria-label={`Move ${loc.name} down`}
                className="tap-scale flex size-6 items-center justify-center rounded text-muted-foreground disabled:opacity-25"
              >
                <ChevronDown className="size-4" aria-hidden />
              </button>
            </div>

            <span className="text-2xl" aria-hidden>
              {loc.emoji}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{loc.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {loc.product_count > 0
                  ? `${loc.product_count} ${loc.product_count === 1 ? "thing" : "things"} inside`
                  : loc.description || "Empty"}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setEditing({ mode: "edit", location: loc })}
              aria-label={`Edit ${loc.name}`}
              className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </Card>

      <Button
        variant="outline"
        size="lg"
        className="h-12 w-full rounded-xl text-base"
        onClick={() => setEditing({ mode: "new" })}
      >
        <Plus className="size-4.5" aria-hidden />
        Add a place
      </Button>

      {editing && (
        <LocationDrawer
          key={editing.mode === "edit" ? editing.location.id : "new"}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LocationDrawer({
  editing,
  onClose,
}: {
  editing: Editing;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const existing = editing.mode === "edit" ? editing.location : null;

  const [name, setName] = useState(existing?.name ?? "");
  const [emoji, setEmoji] = useState(existing?.emoji ?? "📦");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [isFreezer, setIsFreezer] = useState(Boolean(existing?.is_freezer));

  function save() {
    startTransition(async () => {
      const values = {
        name,
        emoji,
        description: description || null,
        isFreezer,
      };
      const result = existing
        ? await updateLocation({ ...values, id: existing.id })
        : await createLocation(values);
      if (!result.ok) { toast.error(result.error); return; }
      toast.success(existing ? "Saved" : `${name} added`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[92dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{existing ? `Edit ${existing.name}` : "New place"}</DrawerTitle>
          <DrawerDescription>
            Pick a picture and a name you&apos;ll both recognise.
          </DrawerDescription>
        </DrawerHeader>

        <div className="no-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-2">
          <div>
            <Label className="mb-2 block">Picture</Label>
            <div className="grid grid-cols-9 gap-1.5">
              {EMOJI_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setEmoji(choice)}
                  aria-label={`Use ${choice}`}
                  aria-pressed={emoji === choice}
                  className={`tap-scale flex aspect-square items-center justify-center rounded-xl border text-xl ${
                    emoji === choice
                      ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                      : "bg-card"
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="loc-name" className="mb-1.5 block">
              Name
            </Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Garage freezer"
              autoFocus={!existing}
              className="h-12 rounded-xl"
            />
          </div>

          <div>
            <Label htmlFor="loc-desc" className="mb-1.5 block">
              What&apos;s usually in it
            </Label>
            <Input
              id="loc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="h-12 rounded-xl"
            />
          </div>

          <label className="flex items-center justify-between rounded-xl border bg-card px-3.5 py-3">
            <span>
              <span className="block font-medium">This is a freezer</span>
              <span className="block text-sm text-muted-foreground">
                Things last much longer in here
              </span>
            </span>
            <Switch checked={isFreezer} onCheckedChange={setIsFreezer} />
          </label>
        </div>

        <DrawerFooter className="gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl text-base"
            disabled={pending || !name.trim()}
            onClick={save}
          >
            {pending ? <Spinner /> : existing ? "Save" : "Add it"}
          </Button>
          {existing && (
            <Button
              variant="ghost"
              className="h-11 rounded-xl text-danger-foreground"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await deleteLocation(existing.id);
                  if (!result.ok) { toast.error(result.error); return; }
                  toast.success(`${existing.name} removed`);
                  router.refresh();
                  onClose();
                })
              }
            >
              <Trash2 className="size-4" aria-hidden />
              Delete this place
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
