"use client";

import { useEffect, useEffectEvent } from "react";

/** Refresh immediately from SSE, and periodically as a safety net for deploys or reconnects. */
export function useShoppingRealtime(onChange: () => void) {
  const notify = useEffectEvent(onChange);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => notify(), 120);
    };

    const source = typeof EventSource === "undefined" ? null : new EventSource("/api/shopping/events");
    source?.addEventListener("shopping", refreshSoon);
    window.addEventListener("online", refreshSoon);
    const poll = setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") refreshSoon();
    }, 15_000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      source?.close();
      window.removeEventListener("online", refreshSoon);
    };
  }, []);
}
