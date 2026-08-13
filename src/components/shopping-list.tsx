"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Plus, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useShoppingRealtime } from "@/hooks/use-shopping-realtime";
import {
  addLowStockToShoppingList,
  addShoppingItem,
  clearCheckedShoppingItems,
  deleteShoppingItem,
  toggleShoppingItem,
} from "@/lib/actions";
import { formatQty, pluralUnit } from "@/lib/dates";
import type { ShoppingCatalogItem } from "@/lib/queries";
import type { ShoppingItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type AddOperation = {
  type: "add";
  clientId: number;
  name: string;
  productId: number | null;
  unit: string | null;
  checked: boolean;
};
type ShoppingOperation =
  | AddOperation
  | { type: "toggle"; id: number; checked: boolean }
  | { type: "delete"; id: number }
  | { type: "clear" };

const QUEUE_KEY = "fridge:shopping-queue:v1";
let nextTemporaryId = -1;

function temporaryId() {
  return nextTemporaryId--;
}

function applyOperation(items: ShoppingItem[], operation: ShoppingOperation): ShoppingItem[] {
  switch (operation.type) {
    case "add":
      return [{
        id: operation.clientId,
        product_id: operation.productId,
        name: operation.name,
        quantity: 1,
        unit: operation.unit,
        checked: operation.checked ? 1 : 0,
        created_at: new Date().toISOString(),
      }, ...items];
    case "toggle":
      return items.map((item) => item.id === operation.id ? { ...item, checked: operation.checked ? 1 : 0 } : item);
    case "delete":
      return items.filter((item) => item.id !== operation.id);
    case "clear":
      return items.filter((item) => !item.checked);
  }
}

function applyOperations(items: ShoppingItem[], operations: ShoppingOperation[]) {
  return operations.reduce(applyOperation, items);
}

function coalesce(operations: ShoppingOperation[], next: ShoppingOperation) {
  if (next.type === "toggle" && next.id < 0) {
    return operations.map((operation) => operation.type === "add" && operation.clientId === next.id
      ? { ...operation, checked: next.checked }
      : operation);
  }
  if (next.type === "delete" && next.id < 0) {
    return operations.filter((operation) => operation.type !== "add" || operation.clientId !== next.id);
  }
  if (next.type === "toggle") {
    return [...operations.filter((operation) => operation.type !== "toggle" || operation.id !== next.id), next];
  }
  if (next.type === "delete") {
    return [...operations.filter((operation) => !((operation.type === "toggle" || operation.type === "delete") && operation.id === next.id)), next];
  }
  if (next.type === "clear") return [...operations.filter((operation) => operation.type === "add"), next];
  return [...operations, next];
}

function readQueue(): ShoppingOperation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as ShoppingOperation[] : [];
  } catch {
    return [];
  }
}

export function ShoppingList({
  items,
  lowStock,
  catalog,
}: {
  items: ShoppingItem[];
  lowStock: Array<{ id: number; name: string; unit: string; in_stock: number }>;
  catalog: ShoppingCatalogItem[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [displayItems, setDisplayItems] = useState(items);
  const [queued, setQueued] = useState<ShoppingOperation[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<ShoppingOperation[]>([]);
  const flushing = useRef(false);

  const saveQueue = useCallback((next: ShoppingOperation[]) => {
    queueRef.current = next;
    setQueued(next);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch { /* storage can be unavailable in private mode */ }
  }, []);

  const perform = useCallback(async (operation: ShoppingOperation) => {
    switch (operation.type) {
      case "add": {
        const result = await addShoppingItem({ name: operation.name, productId: operation.productId, unit: operation.unit });
        if (!result.ok) return result;
        // A user may tick an offline-added item before it syncs. Preserve that intent.
        const current = queueRef.current.find((queuedOperation) => queuedOperation.type === "add" && queuedOperation.clientId === operation.clientId);
        if (current?.type === "add" && current.checked) return toggleShoppingItem({ id: result.data.id, checked: true });
        return result;
      }
      case "toggle": return toggleShoppingItem({ id: operation.id, checked: operation.checked });
      case "delete": return deleteShoppingItem(operation.id);
      case "clear": return clearCheckedShoppingItems();
    }
  }, []);

  const flushQueue = useCallback(async () => {
    if (flushing.current || !navigator.onLine || queueRef.current.length === 0) return;
    flushing.current = true;
    try {
      while (navigator.onLine && queueRef.current.length > 0) {
        const operation = queueRef.current[0];
        try {
          const result = await perform(operation);
          if (!result.ok) {
            toast.error(result.error);
            break;
          }
          saveQueue(queueRef.current.slice(1));
        } catch {
          // The connection may have dropped between navigator.onLine and the request.
          break;
        }
      }
    } finally {
      flushing.current = false;
      if (queueRef.current.length === 0 && navigator.onLine) router.refresh();
    }
  }, [perform, router, saveQueue]);

  useEffect(() => {
    const hydrate = window.setTimeout(() => {
      const stored = readQueue();
      const smallestStoredId = stored.reduce(
        (smallest, operation) => operation.type === "add" ? Math.min(smallest, operation.clientId) : smallest,
        0,
      );
      nextTemporaryId = Math.min(nextTemporaryId, smallestStoredId - 1);
      saveQueue(stored);
      setDisplayItems(applyOperations(items, stored));
      void flushQueue();
    }, 0);
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(hydrate);
      window.removeEventListener("online", onOnline);
    };
  // The queue is intentionally read once; subsequent writes are kept in queueRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushQueue, saveQueue]);

  useEffect(() => {
    if (queueRef.current.length === 0) setDisplayItems(items);
  }, [items]);

  useShoppingRealtime(() => {
    if (queueRef.current.length === 0) router.refresh();
  });

  const suggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    if (query.length < 2) return [];
    return catalog.filter((product) =>
      product.name.toLowerCase().includes(query) || product.brand?.toLowerCase().includes(query),
    ).slice(0, 6);
  }, [catalog, draft]);

  const todo = displayItems.filter((i) => !i.checked);
  const done = displayItems.filter((i) => i.checked);

  const missingFromList = lowStock.filter(
    (l) => !displayItems.some((i) => i.product_id === l.id && !i.checked),
  );

  function queue(operation: ShoppingOperation) {
    setDisplayItems((current) => applyOperation(current, operation));
    const next = coalesce(queueRef.current, operation);
    saveQueue(next);
    if (!navigator.onLine) toast.message("Saved on this device — it will sync when you reconnect.");
    void flushQueue();
  }

  function add(product?: ShoppingCatalogItem) {
    const name = product?.name ?? draft.trim();
    if (!name) return;
    setDraft("");
    setShowSuggestions(false);
    inputRef.current?.focus();
    const clientId = temporaryId();
    startTransition(() => {
      queue({ type: "add", clientId, name, productId: product?.id ?? null, unit: product?.unit ?? null, checked: false });
    });
  }

  function toggle(item: ShoppingItem) {
    const next = !item.checked;
    startTransition(() => {
      queue({ type: "toggle", id: item.id, checked: next });
    });
  }

  function remove(item: ShoppingItem) {
    startTransition(() => {
      queue({ type: "delete", id: item.id });
    });
  }

  return (
    <div className="space-y-5 px-4">
      <div className="relative flex gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setShowSuggestions(true); }}
          onFocus={() => setShowSuggestions(true)}
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
          onClick={() => add()}
        >
          <Plus className="size-5" aria-hidden />
        </Button>
        {showSuggestions && draft.trim().length > 0 && (
          <div className="absolute top-[calc(100%+0.4rem)] z-20 w-[calc(100%-3.5rem)] overflow-hidden rounded-2xl border bg-popover p-1 shadow-lg">
            {suggestions.map((product) => (
              <button key={product.id} type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => add(product)}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-sm">{product.name.slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{product.name}</span>{product.brand && <span className="block truncate text-xs text-muted-foreground">{product.brand}</span>}</span>
                <Plus className="size-4 shrink-0 text-primary" aria-hidden />
              </button>
            ))}
            <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => add()}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-dashed text-primary"><Plus className="size-4" aria-hidden /></span>
              <span className="truncate text-sm font-medium">Add “{draft.trim()}” as something new</span>
            </button>
          </div>
        )}
      </div>

      {queued.length > 0 && (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <CloudOff className="size-3.5" aria-hidden />
          {queued.length} {queued.length === 1 ? "change" : "changes"} waiting to sync
        </p>
      )}

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

      {displayItems.length === 0 ? (
        <Card className="items-center gap-3 p-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-3xl bg-secondary text-4xl">
            🛒
          </div>
          <p className="font-semibold">The list is empty</p>
          <p className="text-sm text-muted-foreground">
            Add things as you run out. Scanning them in at home removes the
            matching item from this list.
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
                  onClick={() => startTransition(() => queue({ type: "clear" }))}
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
