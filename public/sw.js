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

// Browsers rotate a push subscription from time to time, and revoke one when
// site data is cleared. Without this listener the endpoint the server stored
// goes on answering 410 and this device silently receives nothing — which the
// reader experiences as notifications that worked for a while and then just
// stopped, with no way to tell that from a quiet week.
//
// A worker cannot rebuild the record on its own: audience, user_id and
// visitor_token live in localStorage or a session, and it has access to
// neither. So it reports only which endpoint replaced which, and the server
// carries the rest across (see /api/push/migrate).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(carrySubscriptionOver(event));
});

async function carrySubscriptionOver(event) {
  try {
    const old = event.oldSubscription;
    // Without the old endpoint there is nothing to match the stored row
    // against, and guessing would mean creating subscriptions from thin air.
    if (!old || !old.endpoint) return;

    // Chrome commonly fires this without the replacement attached, so take it
    // from wherever it can be found before asking for a new one.
    let fresh = event.newSubscription;
    if (!fresh) fresh = await self.registration.pushManager.getSubscription();
    if (!fresh) {
      const key = old.options && old.options.applicationServerKey;
      if (!key) return;
      fresh = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    }

    const json = fresh.toJSON ? fresh.toJSON() : fresh;
    if (!json || !json.endpoint || !json.keys) return;

    await fetch("/api/push/migrate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        oldEndpoint: old.endpoint,
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      }),
    });
  } catch {
    // Best effort. The next subscribe from a page repairs the record anyway,
    // and throwing here would only produce an unhandled rejection nobody sees.
  }
}

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
