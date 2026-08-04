/* Sojourn service worker — offline caching + Web Push.
 *
 * Two responsibilities:
 *  1) Make the journal installable and usable offline (cache the app shell and
 *     previously-visited pages/assets), so stories you've opened stay readable
 *     on the road with no signal.
 *  2) Receive Web Push notifications for the admin / subscribers.
 */

// The build stamps the version via the registration URL (/sw.js?v=<build>), so
// each deploy gets its own cache and `activate` deletes the previous build's —
// otherwise a fixed name accumulates stale assets forever and serves them on
// cached loads (the bug that broke /admin until a hard reload).
const VERSION =
  new URLSearchParams(self.location.search).get("v") || "v1";
const CACHE = `sojourn-${VERSION}`;
// Bare minimum shell so the app boots offline and can show a fallback.
const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Stale-while-revalidate: serve cache immediately, refresh in the background.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// Network-first for navigations so content stays fresh; fall back to the
// cached page, then to a generic offline page.
async function navigationHandler(request) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || (await cache.match("/offline.html"));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only manage same-origin traffic; let the browser handle cross-origin
  // (map tiles, external images) normally.
  if (url.origin !== self.location.origin) return;
  // Never cache auth/admin/API traffic — it's dynamic and sometimes sensitive.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/auth")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Build assets, the Next image optimizer, fonts, icons → cache-first-ish.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/icon") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|webp|avif|ico)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener("push", (event) => {
  let data = { title: "Sojourn", body: "", url: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: data.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
