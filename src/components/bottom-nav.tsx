"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Refrigerator, ScanBarcode, Settings2, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Kitchen", icon: House, match: (p: string) => p === "/" },
  {
    href: "/locations",
    label: "Places",
    icon: Refrigerator,
    match: (p: string) => p.startsWith("/locations"),
  },
  null, // slot occupied by the scan button
  {
    href: "/shopping",
    label: "Shopping",
    icon: ShoppingBasket,
    match: (p: string) => p.startsWith("/shopping"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings2,
    match: (p: string) => p.startsWith("/settings"),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  // The scanner takes over the whole screen; a nav bar there would be noise.
  if (pathname.startsWith("/scan")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="grid h-[4.25rem] grid-cols-5 items-center px-1">
        {TABS.map((tab) => {
          if (!tab) return <ScanButton key="scan" />;
          const Icon = tab.icon;
          const active = tab.match(pathname);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "tap-scale flex h-full flex-col items-center justify-center gap-1 rounded-xl text-[0.65rem] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon
                className="size-[1.35rem]"
                strokeWidth={active ? 2.4 : 1.9}
                aria-hidden
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="safe-bottom" />
    </nav>
  );
}

function ScanButton() {
  return (
    <div className="relative h-full">
      <Link
        href="/scan"
        aria-label="Scan a barcode"
        className="tap-scale absolute -top-7 left-1/2 flex size-[3.85rem] -translate-x-1/2 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background"
      >
        <ScanBarcode className="size-7" strokeWidth={2.1} aria-hidden />
      </Link>
      <span className="absolute inset-x-0 bottom-3 text-center text-[0.65rem] font-medium text-muted-foreground">
        Scan
      </span>
    </div>
  );
}
