import "server-only";

// Single seam for best-effort failures that the data/notify layers otherwise
// swallow. Keeps the graceful fallback (callers still return empty/null) but
// makes a real outage — Supabase down, a provider 500ing every call — visible in
// server logs instead of silently invisible. Quiet under tests.
export function logError(scope: string, err: unknown): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  // eslint-disable-next-line no-console
  console.error(`[sojourn:${scope}]`, err);
}
