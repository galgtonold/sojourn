/**
 * Leave for `href` after the session has changed — signing in, claiming the
 * install, signing out.
 *
 * A full document load, deliberately, where the rest of the admin navigates
 * softly.
 *
 * ── Why not router.push ─────────────────────────────────────────────────────
 *
 * Every one of these sites used to call `router.push(href)` and then
 * `router.refresh()` on the next line, and that pairing is the one thing all
 * three observed failures had in common: a CI run stuck on /admin/login with
 * the button still reading "Anmelden…", another stuck on /admin/setup with
 * "Wird angelegt…", and the same thing once on a loaded laptop. Authentication
 * had succeeded every time — the token requests returned 200 and no 5xx or 429
 * appears anywhere in the gateway logs. The navigation afterwards simply did
 * not land, and because `busy` is only cleared on the error path, a push that
 * does not arrive is indistinguishable from a click that did nothing. The user
 * is left looking at a disabled button forever.
 *
 * `refresh()` invalidates the router cache and refetches the CURRENT route
 * while the push's fetch for the next one is still in flight; back to back,
 * they race. But the deeper point is that a soft navigation is the wrong
 * instrument here even when it works. The client router cache was populated
 * under the OLD session — /admin was very likely prefetched while signed out
 * and answered with a redirect to the login page — so the payloads it holds
 * describe a visitor who no longer exists. `router.refresh()` on the following
 * line is that problem being noticed and half-addressed.
 *
 * A document request settles both: the new cookie goes to the server, the
 * server renders for whoever is now signed in, and every client cache is
 * discarded on the way. The cost is one full page load, once per session
 * change, which is the least busy moment there is.
 *
 * Not `router.replace` either: it is the same client navigation with the same
 * cache and the same race.
 */
export function navigateAfterAuth(href: string): void {
  // assign(), not href=, so the previous page stays in history — a reader who
  // signs out and hits back gets the login page, not a cached admin screen.
  window.location.assign(href);
}
