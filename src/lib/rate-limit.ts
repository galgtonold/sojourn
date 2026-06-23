import "server-only";

// Best-effort, in-memory sliding-window rate limiter for the anonymous write
// endpoints (comments, reactions, votes). On serverless this is PER-INSTANCE —
// not shared across regions and reset on cold start — so it's a first line of
// defense against rapid floods from a single source, not a hard guarantee. A
// stricter limit would need a shared store (Postgres / Upstash); this deters the
// common case (a script hammering the comment endpoint) without that dependency.
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
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

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (
    xff?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}
