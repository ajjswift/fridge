"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Refrigerator,
  ScanBarcode,
  Settings2,
  ShoppingBasket,
} from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Kitchen", description: "What you have", icon: House, match: (path: string) => path === "/" },
  { href: "/locations", label: "Places", description: "Where it is", icon: Refrigerator, match: (path: string) => path.startsWith("/locations") },
  { href: "/shopping", label: "Shopping", description: "Things to buy", icon: ShoppingBasket, match: (path: string) => path.startsWith("/shopping") },
  { href: "/settings", label: "Settings", description: "Kitchen preferences", icon: Settings2, match: (path: string) => path.startsWith("/settings") },
] as const;

/** Desktop navigation deliberately complements the compact mobile tab bar. */
export function DesktopNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden border-r border-border/70 bg-card/55 md:block">
      <div className="sticky top-0 flex h-dvh flex-col px-4 py-6 lg:px-5">
        <Link href="/" className="tap-scale flex items-center gap-3 rounded-2xl px-3 py-2">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-xl shadow-sm">
            🧊
          </span>
          <span>
            <span className="block text-lg font-semibold tracking-tight">Fridge</span>
            <span className="block text-xs text-muted-foreground">Your kitchen</span>
          </span>
        </Link>

        <Link
          href="/scan"
          className={cn(
            "tap-scale mt-8 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground shadow-md shadow-primary/20",
            pathname.startsWith("/scan") && "ring-2 ring-primary ring-offset-2 ring-offset-card",
          )}
        >
          <ScanBarcode className="size-5" aria-hidden />
          Scan barcode
        </Link>

        <nav aria-label="Main navigation" className="mt-5 space-y-1">
          {LINKS.map((link) => {
            const Icon = link.icon;
            const active = link.match(pathname);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "tap-scale flex items-center gap-3 rounded-xl px-3 py-3",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted/75 hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" strokeWidth={active ? 2.4 : 2} aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium leading-tight">{link.label}</span>
                  <span className="block text-xs text-muted-foreground">{link.description}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <p className="mt-auto px-3 text-xs leading-relaxed text-muted-foreground">
          Keep track of what&apos;s in your kitchen and what needs using first.
        </p>
      </div>
    </aside>
  );
}
