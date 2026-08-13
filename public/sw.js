/* Fridge service worker — push notifications only, no offline caching. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

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
