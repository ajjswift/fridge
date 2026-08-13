"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

export function SearchField({ initialValue }: { initialValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep typing responsive; only ask the server once the user pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = value.trim();
      if (next === initialValue) return;
      router.replace(next ? `/search?q=${encodeURIComponent(next)}` : "/search", {
        scroll: false,
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [value, initialValue, router]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        type="search"
        enterKeyHint="search"
        placeholder="Milk, Heinz, 5000…"
        aria-label="Search your kitchen"
        className="h-12 w-full rounded-2xl border bg-card pl-11 pr-11 text-base outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
