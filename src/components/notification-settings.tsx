"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Send, Share, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  sendDigestNow,
  sendTestNotification,
  setNotificationPrefs,
} from "@/lib/push-actions";
import {
  detectPushSupport,
  isSubscribedHere,
  subscribeToPush,
  unsubscribeFromPush,
  type PushSupport,
} from "@/lib/push-client";

export function NotificationSettings({
  vapidPublicKey,
  notifyEnabled,
  notifyTime,
  householdDevices,
}: {
  vapidPublicKey: string;
  notifyEnabled: boolean;
  notifyTime: string;
  /** Devices subscribed across the whole household, not just this browser. */
  householdDevices: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [working, setWorking] = useState(false);
  const [time, setTime] = useState(notifyTime);
  const [enabled, setEnabled] = useState(notifyEnabled);

  // Push support and the current subscription are only knowable in the browser.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      const result = detectPushSupport();
      const here = result === "ready" ? await isSubscribedHere() : false;
      if (cancelled) return;
      setSupport(result);
      setSubscribed(here);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleDevice(next: boolean) {
    setWorking(true);
    try {
      if (next) {
        const outcome = await subscribeToPush(vapidPublicKey);
        if (!outcome.ok) {
          toast.error(outcome.message);
          return;
        }
        setSubscribed(true);
        toast.success("Reminders are on for this device");
      } else {
        await unsubscribeFromPush();
        setSubscribed(false);
        toast.success("Reminders are off for this device");
      }
      router.refresh();
    } finally {
      setWorking(false);
    }
  }

  function savePrefs(changes: { enabled?: boolean; time?: string }) {
    startTransition(async () => {
      const result = await setNotificationPrefs(changes);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
        Reminders
      </h2>
      <Card className="gap-5 p-4">
        <p className="text-sm text-muted-foreground">
          Once a day, your phone can buzz with whatever needs eating. It works
          even when the app is closed.
        </p>

        {support === null ? (
          <div className="flex h-12 items-center justify-center">
            <Spinner />
          </div>
        ) : support === "ready" ? (
          <>
            <label className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3.5 py-3">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-medium">
                  {subscribed ? (
                    <Bell className="size-4 text-primary" aria-hidden />
                  ) : (
                    <BellOff className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  Remind me on this device
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {subscribed
                    ? "This device will get the daily reminder."
                    : "Each phone or computer needs turning on separately."}
                </span>
              </span>
              <Switch
                checked={subscribed}
                disabled={working}
                onCheckedChange={toggleDevice}
                aria-label="Remind me on this device"
              />
            </label>

            {/* The schedule belongs to the household, so it stays visible on a
                laptop even when only a phone is subscribed. */}
            {(subscribed || householdDevices > 0) && (
              <>
                <div>
                  <Label htmlFor="notify-time" className="mb-1.5 block">
                    What time
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="notify-time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      onBlur={() => {
                        if (time && time !== notifyTime) savePrefs({ time });
                      }}
                      className="h-12 flex-1 rounded-xl border bg-card px-3.5 text-base outline-none ring-primary/40 focus:ring-2"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Nothing is sent on days when there&apos;s nothing to say.
                  </p>
                </div>

                <label className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-medium">Daily reminder</span>
                    <span className="block text-sm text-muted-foreground">
                      Turn off to pause it for everyone
                    </span>
                  </span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(next) => {
                      setEnabled(next);
                      savePrefs({ enabled: next });
                    }}
                    aria-label="Daily reminder for everyone"
                  />
                </label>

                <p className="-mt-2 text-xs text-muted-foreground">
                  {householdDevices === 0
                    ? "No devices are set up yet."
                    : `Going to ${householdDevices} ${
                        householdDevices === 1 ? "device" : "devices"
                      } across the house.`}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-11 rounded-xl"
                    disabled={working || !subscribed}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await sendTestNotification();
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success("Sent — check your notifications");
                      })
                    }
                  >
                    <Send className="size-4" aria-hidden />
                    Test it
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 rounded-xl"
                    disabled={working}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await sendDigestNow();
                        if (!result.ok) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success(
                          `Sent to ${result.data.sent} ${
                            result.data.sent === 1 ? "device" : "devices"
                          }`,
                        );
                      })
                    }
                  >
                    Send to everyone
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <UnsupportedNote support={support} />
        )}
      </Card>
    </section>
  );
}

function UnsupportedNote({ support }: { support: PushSupport }) {
  const content = {
    "needs-install": {
      icon: Share,
      title: "Add Recime to your Home Screen first",
      body: "On iPhone and iPad, reminders only work once the app is installed. Tap the Share button in Safari, then “Add to Home Screen”, and open it from there.",
    },
    insecure: {
      icon: TriangleAlert,
      title: "Needs a secure connection",
      body: "Reminders only work over https. Start the server with `npm run dev:phone` and open the https address it prints.",
    },
    unsupported: {
      icon: TriangleAlert,
      title: "This browser can't do reminders",
      body: "Try Chrome or Edge on Android and desktop, or Safari 16.4+ on an installed iPhone app.",
    },
    ready: { icon: Bell, title: "", body: "" },
  }[support];

  const Icon = content.icon;

  return (
    <div className="flex gap-3 rounded-xl bg-muted/60 p-3.5">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="font-medium leading-tight">{content.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{content.body}</p>
      </div>
    </div>
  );
}
