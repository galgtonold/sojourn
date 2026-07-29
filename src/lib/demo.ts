// Demo mode — the public showcase deployment (see
// docs/superpowers/specs/2026-07-29-demo-mode-design.md).
//
// A demo gets linked somewhere public and clicked by many people at once, so
// anything writable gets vandalised exactly when it matters most. Sojourn's
// answer is a deployment that is read-only for EVERYONE — there is no account,
// not even the owner's, that can write through the UI. Demo content is written
// by the seed script.
//
// That is what keeps this file pure: no session lookup, no demo-user identity to
// compare against, nothing to leak, nothing to reset after a vandal. A guard
// that never has to ask "who is this?" can't be fooled about who someone is.
//
// Enforced in `src/middleware.ts`, in front of every route, because the admin
// API has no single auth gate to hook: some routes go through `requireOwner` and
// the service-role client, others hand the request to the RLS client and let
// Postgres decide. A per-route guard would be one forgotten route away from a
// writable demo.

/** Verbs that cannot change anything, so demo mode has no reason to care. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Public endpoints refused in demo mode. Comments are free text on a showcase
 * nobody is moderating; reactions, poll votes and comment likes carry no text,
 * so they stay live — they are half of what makes a demo worth clicking.
 */
const BLOCKED_PUBLIC = new Set(["/api/comments"]);

/**
 * Would demo mode refuse this request? Callers check `env.demoMode` first — on a
 * normal self-hosted install this is never consulted.
 *
 * Admin routes are guarded by prefix rather than by name: every `/api/admin`
 * handler is a mutation today (18 POST, 3 PUT, 2 DELETE, no GET — admin pages
 * read their data server-side), and guarding the prefix means a route added
 * later is covered without anyone remembering to come back here.
 */
export function demoBlocks(pathname: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    path === "/api/admin" ||
    path.startsWith("/api/admin/") ||
    BLOCKED_PUBLIC.has(path)
  );
}
