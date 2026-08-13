"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { QuantityStepper } from "@/components/quantity-stepper";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSetting } from "@/lib/actions";
import { cn } from "@/lib/utils";

export function SettingsScreen({
  householdName,
  soonDays,
}: {
  householdName: string;
  soonDays: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(householdName);
  const [days, setDays] = useState(soonDays);

  function save(key: string, value: string, message?: string) {
    startTransition(async () => {
      const result = await setSetting(key, value);
      if (!result.ok) { toast.error(result.error); return; }
      if (message) toast.success(message);
      router.refresh();
    });
  }

  return (
    <>
      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          This kitchen
        </h2>
        <Card className="gap-5 p-4">
          <div>
            <Label htmlFor="household" className="mb-1.5 block">
              What to call it
            </Label>
            <Input
              id="household"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                if (name.trim() && name !== householdName) {
                  save("household_name", name.trim(), "Saved");
                }
              }}
              className="h-12 rounded-xl"
            />
          </div>

          <div>
            <Label className="mb-1 block">Warn me this many days ahead</Label>
            <p className="mb-3 text-sm text-muted-foreground">
              Things within {days} {days === 1 ? "day" : "days"} of their date show
              up under &ldquo;eat these first&rdquo;.
            </p>
            <QuantityStepper
              value={days}
              onChange={(next) => {
                setDays(next);
                save("expiry_soon_days", String(next));
              }}
              unit="day"
              min={1}
              max={60}
              size="sm"
            />
          </div>
        </Card>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          Appearance
        </h2>
        <ThemeChooser />
      </section>
    </>
  );
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

const NO_SUBSCRIBE = () => () => {};

function ThemeChooser() {
  const { theme, setTheme } = useTheme();

  // The stored theme isn't known until after hydration, so the server render
  // has to show nothing selected rather than guess and mismatch.
  const mounted = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => true,
    () => false,
  );

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((option) => {
        const Icon = option.icon;
        const active = mounted && theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            className={cn(
              "tap-scale flex flex-col items-center gap-1.5 rounded-2xl border p-3.5",
              active ? "border-primary bg-primary/10 ring-2 ring-primary/30" : "bg-card",
            )}
          >
            <Icon
              className={cn("size-5", !active && "text-muted-foreground")}
              aria-hidden
            />
            <span className={cn("text-sm font-medium", !active && "text-muted-foreground")}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
