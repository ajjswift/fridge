"use client";

/** Browser-side plumbing for the Push API. Everything here is best-effort. */

export type PushSupport =
  | "ready"
  | "unsupported"
  | "insecure"
  | "needs-install"; // iOS only grants push to home-screen apps

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return "unsupported";
  if (!window.isSecureContext) return "insecure";

  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone));

  // iOS/iPadOS only permits web push for an installed Home Screen app. Check
  // this before feature detection because Safari's exposed APIs vary by OS
  // release, while the required user action is the same.
  if (isApple && !standalone) return "needs-install";

  const hasApi =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  return hasApi ? "ready" : "unsupported";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export type SubscribeOutcome =
  | { ok: true }
  | { ok: false; reason: "denied" | "failed"; message: string };

export async function subscribeToPush(
  vapidPublicKey: string,
): Promise<SubscribeOutcome> {
  if (detectPushSupport() !== "ready") {
    return {
      ok: false,
      reason: "failed",
      message: "Reminders aren't available in this browser.",
    };
  }
  const registration = await registerServiceWorker();
  if (!registration) {
    return { ok: false, reason: "failed", message: "Couldn't start the background helper." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason: "denied",
      message:
        permission === "denied"
          ? "Notifications are blocked for this site in your browser settings."
          : "Notifications weren't allowed.",
    };
  }

  try {
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      }));

    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...subscription.toJSON(), label: deviceLabel() }),
    });
    if (!response.ok) throw new Error("save failed");

    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "failed",
      message: "Couldn't set up notifications on this device.",
    };
  }
}

export async function unsubscribeFromPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  } catch {
    // Push state is browser-managed. If its APIs are unavailable, treating the
    // device as unsubscribed is safer than crashing the settings screen.
  }
}

export async function isSubscribedHere(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}
