// Two ways to answer "is this request signed in?" without asking Supabase.
//
// Middleware verifies the session on every request it matches, and that is a
// network round trip to Supabase Auth. One request needing one verification is
// correct; the problem is how many requests one page load makes. Next prefetches
// every <Link> in the viewport, each prefetch runs the middleware, and a
// dashboard load was measured at 26 verifications inside a single second — which
// is what exhausted the all-in-one stack's login rate limit and locked the owner
// out of a fresh install.
//
// Neither helper weakens the gate. The first answers only when there is no
// session to verify at all; the second reuses a verification the same process
// made moments ago, for the same token.
//
// No `server-only`: this runs in the edge middleware, and is pure over strings
// so it can be tested without one.

/**
 * Does this request carry a Supabase session cookie at all?
 *
 * `@supabase/ssr` stores the session as `sb-<ref>-auth-token`, split across
 * `.0`, `.1`, … when it outgrows a single cookie. No such cookie means there is
 * nothing to verify, and asking Supabase can only return "no user" — so the
 * round trip is pure latency. It is also the common case for anything probing
 * /admin, which is exactly when you least want to spend a request on it.
 */
export function hasSessionCookie(names: readonly string[]): boolean {
  return names.some((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n));
}

/** How long a verification may be reused. */
export const VERIFY_TTL_MS = 5_000;

/**
 * Bounded, so a long-lived process cannot accumulate one entry per token it has
 * ever seen. Small on purpose: this exists to collapse one page load's burst,
 * not to be a session store.
 */
export const VERIFY_MAX_ENTRIES = 64;

type Entry = { userId: string | null; at: number };

/**
 * Process-wide, because separate bundles must agree — and because the whole
 * point is to be shared across the requests of one page load.
 */
const store: Map<string, Entry> = ((globalThis as Record<string, unknown>)
  .__sojourn_verify_cache ??= new Map<string, Entry>()) as Map<string, Entry>;

/**
 * The verification this process last made for exactly this token, if it is
 * still fresh. `undefined` means "ask Supabase"; `null` means "asked, and there
 * is no user" — a distinction the caller needs, since both are falsy.
 *
 * Keyed by the token itself: signing out clears the cookie and a refreshed
 * session carries a new one, so neither can hit a stale entry. What the TTL
 * bounds is revocation performed elsewhere — an account deleted in the Supabase
 * dashboard stays usable for at most VERIFY_TTL_MS.
 */
export function cachedVerification(
  token: string,
  now: number,
): string | null | undefined {
  const hit = store.get(token);
  if (!hit) return undefined;
  if (now - hit.at >= VERIFY_TTL_MS) {
    store.delete(token);
    return undefined;
  }
  return hit.userId;
}

/** Record a verification. Evicts oldest-first once the cap is reached. */
export function rememberVerification(
  token: string,
  userId: string | null,
  now: number,
): void {
  // Re-inserting moves a key to the end of Map iteration order only if deleted
  // first, which is what keeps the eviction below genuinely oldest-first.
  store.delete(token);
  store.set(token, { userId, at: now });
  while (store.size > VERIFY_MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** Testing seam — nothing in the app clears this. */
export function resetVerificationCache(): void {
  store.clear();
}
