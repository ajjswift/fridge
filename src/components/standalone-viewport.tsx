"use client";

import { useLayoutEffect } from "react";

const LOCKED_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";

function isStandaloneMobileApp() {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone));

  // Desktop PWAs should retain normal browser zoom. A coarse pointer covers
  // home-screen iPhone/iPad and Android apps without browser UA sniffing.
  return standalone && window.matchMedia("(pointer: coarse)").matches;
}

/** Locks pinch zoom only for the installed, touch-first app shell. */
export function StandaloneViewport() {
  useLayoutEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) return;
    const normalViewport = viewport.getAttribute("content") ?? "width=device-width, initial-scale=1";
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");

    const update = () => {
      viewport.setAttribute(
        "content",
        isStandaloneMobileApp() ? LOCKED_VIEWPORT : normalViewport,
      );
    };

    update();
    standaloneQuery.addEventListener("change", update);
    return () => {
      standaloneQuery.removeEventListener("change", update);
      viewport.setAttribute("content", normalViewport);
    };
  }, []);

  return null;
}
