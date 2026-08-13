import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

// Rate limiting for the endpoints strangers can reach.
//
// This used to be a Map in module scope, and on serverless that is per-instance
// and wiped on every cold start — so it deterred a script hammering one warm
// lambda and nothing else. Spread the same flood across regions, or just wait
// for a cold start, and the limit was never reached. Postgres is already here,
// already shared between instances, and already the thing an abusive request is
// ultimately trying to reach; the counter belongs there (migration 0047).
//
// The in-memory map survives as the FALLBACK, for the cases where the database
// cannot answer: no service-role key configured, or the call failed. A limiter
// that throws, or that refuses everything because its store is unreachable, is a
// worse outage than the flood it exists to slow down.

const hits = new Map<string, number[]>();

/**
 * The old per-instance limiter, kept for when the shared one is unavailable.
 *
 * Exported so the fallback can be tested directly rather than only by breaking
 * the database.
 */
export function rateLimitLocal(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  // Bound memory: occasionally drop fully-expired buckets.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t > windowMs)) hits.delete(k);
    }
  }
  return true;
}

/**
 * How often to tidy old counters, as a fraction of calls.
 *
 * Opportunistic rather than scheduled: a self-hosted Postgres has no pg_cron,
 * and this table is small enough that housekeeping now and then is plenty.
 */
const PRUNE_CHANCE = 0.002;

/**
 * Count one hit against `key` and say whether the caller may proceed.
 *
 * Shared across instances when the database is reachable, per-instance when it
 * is not. Never throws.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const admin = getAdminSupabase();
  if (!admin) return rateLimitLocal(key, limit, windowMs);

  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.round(windowMs / 1000)),
    });
    if (error || typeof data !== "boolean") {
      // An instance that predates migration 0047 has no such function. Falling
      // back keeps it protected as well as it ever was, rather than failing
      // open completely or refusing every write.
      return rateLimitLocal(key, limit, windowMs);
    }
    if (Math.random() < PRUNE_CHANCE) {
      void admin.rpc("prune_rate_limits", { p_older_than_hours: 24 });
    }
    return data;
  } catch {
    return rateLimitLocal(key, limit, windowMs);
  }
}

/** The key used when the caller cannot be told apart from anyone else. */
export const SHARED_CLIENT = "shared";

/**
 * How much higher the ceiling sits when the bucket holds everybody.
 *
 * A per-visitor number is a fairness rule; a shared one can only be a flood
 * guard, and the two want different sizes. Leaving comments at 10/minute once
 * the bucket is site-wide means ten comments a minute between all readers —
 * which is how an install with no proxy in front started refusing its own
 * visitors. 20x turns that into 200/minute: still a ceiling, no longer a rule
 * about individuals.
 */
export const SHARED_LIMIT_FACTOR = 20;

/**
 * Can `x-forwarded-for` be believed on this deployment?
 *
 * Only whoever runs it knows. The header is set by whatever sits in front, and
 * with nothing in front it is simply whatever the client typed — so trusting it
 * unconditionally means the limit is skipped by sending a different value each
 * time, which is exactly what it did.
 *
 * Vercel is the one case we can answer for ourselves: it sets the header and
 * overwrites any inbound copy, so there it is authoritative. Everywhere else an
 * operator opts in, having put a proxy in front that both SETS the header and
 * STRIPS what arrived with the request. Both halves matter — a proxy that only
 * appends leaves the forged value in front, where `.split(",")[0]` finds it.
 */
export function trustsForwardedFor(): boolean {
  return Boolean(process.env.VERCEL) || process.env.TRUST_PROXY_HEADERS === "1";
}

/**
 * Who to count this request against — or SHARED_CLIENT when that is unknowable.
 *
 * Never invent an identity: answering "unknown" per request would be the same
 * bucket under a different name, and answering with the forged header would be
 * no bucket at all.
 */
export function clientIp(req: Request): string {
  if (!trustsForwardedFor()) return SHARED_CLIENT;
  const xff = req.headers.get("x-forwarded-for");
  return (
    xff?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    SHARED_CLIENT
  );
}

/**
 * The key fragment and the limit that belong together.
 *
 * Callers pass the per-visitor allowance they want; this decides whether the
 * request can be attributed to a visitor at all, and scales the limit when it
 * cannot. Keeping the two together is the point — a shared key with a
 * per-visitor number is the bug.
 */
export function limitFor(
  req: Request,
  perClient: number,
): { ip: string; limit: number } {
  const ip = clientIp(req);
  return {
    ip,
    limit: ip === SHARED_CLIENT ? perClient * SHARED_LIMIT_FACTOR : perClient,
  };
}
