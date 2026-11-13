/* iSkillSpot LMS service worker — push + PWA lifecycle only.
 *
 * Deliberately NO fetch caching: this app is fully authenticated and must
 * never serve cached HTML or API responses. The worker exists to receive
 * Web Push messages and to satisfy PWA installability. Static-asset
 * caching can be added later as a separate, reviewed change.
 */

self.addEventListener("install", () => {
  // Take over promptly; there is no cache to migrate.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "iSkillSpot LMS";
  const options = {
    body: typeof data.body === "string" ? data.body : "You have a new notification.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an existing LMS tab and navigate it, else open a new one.
      for (const client of clients) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client && target !== "/") client.navigate(target).catch(() => {});
          return;
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
