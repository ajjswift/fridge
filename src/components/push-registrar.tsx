"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/push-client";

/**
 * Registers the service worker once per session. Without this, a device that
 * subscribed on a previous visit would stop receiving pushes after the worker
 * is evicted. Asking for permission stays in Settings — never on page load.
 */
export function PushRegistrar() {
  useEffect(() => {
    if (Notification?.permission !== "granted") return;
    void registerServiceWorker();
  }, []);

  return null;
}
