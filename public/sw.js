/* Fridge service worker — push, plus a small offline shell for shopping trips. */

const OFFLINE_CACHE = "fridge-offline-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(
    keys
      .filter((key) => key.startsWith("fridge-offline-") && key !== OFFLINE_CACHE)
      .map((key) => caches.delete(key)),
  )).then(() => self.clients.claim()),
));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Save pages the user has actually opened. Online requests always win, so
  // this is only served when signal disappears; it never makes online data stale.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) event.waitUntil(
            caches.open(OFFLINE_CACHE).then((cache) => cache.put(request, response.clone())),
          );
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/")) ?? Response.error()),
    );
    return;
  }

  // Keep the versioned Next assets that make a cached page interactive. This
  // is cache-first because their hash changes whenever their contents change.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
        if (response.ok) event.waitUntil(
          caches.open(OFFLINE_CACHE).then((cache) => cache.put(request, response.clone())),
        );
        return response;
      })),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Fridge", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Fridge";
  const options = {
    body: payload.body || "",
    icon: "/icon.svg",
    badge: "/badge.svg",
    tag: payload.tag || "fridge",
    renotify: Boolean(payload.tag),
    data: { url: payload.url || "/" },
    // A silent buzz is enough; this is a reminder, not an alarm.
    vibrate: [40, 60, 40],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Reuse an open tab rather than piling up new ones.
        for (const client of clientList) {
          if (client.url === target && "focus" in client) return client.focus();
        }
        for (const client of clientList) {
          if ("navigate" in client) return client.navigate(target).then((c) => c && c.focus());
        }
        return self.clients.openWindow(target);
      }),
  );
});
