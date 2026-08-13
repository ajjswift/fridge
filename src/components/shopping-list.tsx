"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  addLowStockToShoppingList,
  addShoppingItem,
  clearCheckedShoppingItems,
  deleteShoppingItem,
  toggleShoppingItem,
} from "@/lib/actions";
import { formatQty, pluralUnit } from "@/lib/dates";
import type { ShoppingItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ShoppingList({
  items,
  lowStock,
}: {
  items: ShoppingItem[];
  lowStock: Array<{ id: number; name: string; unit: string; in_stock: number }>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Ticking things off in a supermarket aisle must never wait on a round trip.
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (state, change: { id: number; checked?: boolean; remove?: boolean }) =>
      change.remove
        ? state.filter((i) => i.id !== change.id)
        : state.map((i) =>
            i.id === change.id ? { ...i, checked: change.checked ? 1 : 0 } : i,
          ),
  );

  const todo = optimisticItems.filter((i) => !i.checked);
  const done = optimisticItems.filter((i) => i.checked);

  const missingFromList = lowStock.filter(
    (l) => !items.some((i) => i.product_id === l.id && !i.checked),
  );

  function add() {
    const name = draft.trim();
    if (!name) return;
    setDraft("");
    inputRef.current?.focus();
    startTransition(async () => {
      const result = await addShoppingItem({ name });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  function toggle(item: ShoppingItem) {
    const next = !item.checked;
    startTransition(async () => {
      applyOptimistic({ id: item.id, checked: next });
      const result = await toggleShoppingItem({ id: item.id, checked: next });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  function remove(item: ShoppingItem) {
    startTransition(async () => {
      applyOptimistic({ id: item.id, remove: true });
      const result = await deleteShoppingItem(item.id);
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 px-4">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add something…"
          aria-label="Add to the shopping list"
          enterKeyHint="done"
          className="h-12 min-w-0 flex-1 rounded-2xl border bg-card px-4 text-base outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
        <Button
          size="lg"
          className="size-12 shrink-0 rounded-2xl p-0"
          aria-label="Add to the list"
          disabled={!draft.trim()}
          onClick={add}
        >
          <Plus className="size-5" aria-hidden />
        </Button>
      </div>

      {missingFromList.length > 0 && (
        <Card className="flex-row items-center gap-3 border-warn/25 bg-warn-muted/50 p-3.5 shadow-none">
          <TriangleAlert
            className="size-5 shrink-0 text-warn-foreground"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-warn-foreground">
              {missingFromList.length} {missingFromList.length === 1 ? "thing has" : "things have"}{" "}
              run low
            </p>
            <p className="truncate text-xs text-warn-foreground/75">
              {missingFromList.map((l) => l.name).join(", ")}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="shrink-0 rounded-full"
            onClick={() =>
              startTransition(async () => {
                const result = await addLowStockToShoppingList();
                if (!result.ok) { toast.error(result.error); return; }
                toast.success(`Added ${result.data.added} to the list`);
                router.refresh();
              })
            }
          >
            Add all
          </Button>
        </Card>
      )}

      {optimisticItems.length === 0 ? (
        <Card className="items-center gap-3 p-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-4xl">
            🛒
          </div>
          <p className="font-semibold">The list is empty</p>
          <p className="text-sm text-muted-foreground">
            Add things as you run out. Scanning them back in at home ticks them
            off automatically.
          </p>
        </Card>
      ) : (
        <>
          {todo.length > 0 && (
            <Card className="gap-0 overflow-hidden p-0">
              {todo.map((item, i) => (
                <Row
                  key={item.id}
                  item={item}
                  onToggle={() => toggle(item)}
                  onRemove={() => remove(item)}
                  className={cn(i > 0 && "border-t")}
                />
              ))}
            </Card>
          )}

          {done.length > 0 && (
            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-muted-foreground">
                  In the basket ({done.length})
                </h2>
                <button
                  type="button"
                  className="text-sm font-medium text-primary"
                  onClick={() =>
                    startTransition(async () => {
                      const result = await clearCheckedShoppingItems();
                      if (!result.ok) { toast.error(result.error); return; }
                      router.refresh();
                    })
                  }
                >
                  Clear
                </button>
              </div>
              <Card className="gap-0 overflow-hidden p-0 opacity-60">
                {done.map((item, i) => (
                  <Row
                    key={item.id}
                    item={item}
                    onToggle={() => toggle(item)}
                    onRemove={() => remove(item)}
                    className={cn(i > 0 && "border-t")}
                  />
                ))}
              </Card>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  item,
  onToggle,
  onRemove,
  className,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onRemove: () => void;
  className?: string;
}) {
  const checked = Boolean(item.checked);
  return (
    <div className={cn("flex items-center gap-3 pr-2", className)}>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className="tap-scale flex min-w-0 flex-1 items-center gap-3 py-3.5 pl-4 text-left"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
            checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", checked && "line-through")}>
            {item.name}
          </span>
          {item.quantity > 1 && (
            <span className="block text-sm text-muted-foreground">
              {formatQty(item.quantity)}{" "}
              {item.unit ? pluralUnit(item.unit, item.quantity) : ""}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.name}`}
        className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
