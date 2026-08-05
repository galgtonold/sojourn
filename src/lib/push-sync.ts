// When should a browser check in with the server about its push subscription?
//
// Pure, so the decisions are reachable from a test without a PushManager.
//
// The browser is the only thing that knows its subscription is still live; the
// server is the only thing that knows whether it still has a row for it. They
// drift — a 410 prunes the row, a rotation replaces the endpoint — and nothing
// reconciles them, so the switch reads ON while nothing is being delivered.
//
// Checking on every page load would mean a write per page view and would eat
// the subscribe endpoint's hourly ceiling during ordinary reading. Checking
// once a day is enough for a row that vanished, and the endpoint is part of
// the record so a CHANGED endpoint re-checks immediately — which is the case
// that actually matters, and the one `pushsubscriptionchange` misses whenever
// the worker was asleep or the browser is Safari.

export type PushAudience = "admin" | "viewer";

export type SyncRecord = {
  endpoint: string;
  at: number;
  /**
   * What this browser subscribed AS. A property of the browser rather than of
   * the endpoint, which is why it survives a rotation: when the endpoint
   * changes we still know whether this was an admin or a reader.
   */
  audience?: PushAudience;
};

export const RESYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

function parse(raw: string | null): SyncRecord | null {
  if (!raw) return null;
  try {
    const rec = JSON.parse(raw) as SyncRecord;
    if (!rec || typeof rec.endpoint !== "string" || typeof rec.at !== "number") {
      return null;
    }
    return Number.isFinite(rec.at) ? rec : null;
  } catch {
    return null;
  }
}

/** Should this browser ask the server whether it still knows `endpoint`? */
export function shouldResync(
  raw: string | null,
  endpoint: string,
  now: number,
): boolean {
  const rec = parse(raw);
  if (!rec) return true;
  // A different endpoint means the subscription rotated. Check straight away —
  // waiting out the interval here would leave the reader silent for a day.
  if (rec.endpoint !== endpoint) return true;
  // A clock that moved backwards would otherwise park this until it caught up.
  if (rec.at > now) return true;
  return now - rec.at >= RESYNC_INTERVAL_MS;
}

/**
 * What this browser last subscribed as, if it is known.
 *
 * Deliberately ignores the endpoint: after a rotation the stored endpoint is
 * the old one, and the audience is exactly what we still need.
 */
export function rememberedAudience(raw: string | null): PushAudience | null {
  const a = parse(raw)?.audience;
  return a === "admin" || a === "viewer" ? a : null;
}

export function syncRecord(
  endpoint: string,
  at: number,
  audience: PushAudience | null,
): string {
  const rec: SyncRecord = { endpoint, at };
  if (audience) rec.audience = audience;
  return JSON.stringify(rec);
}
