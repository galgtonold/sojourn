// Sojourn's env names, and the ones Vercel's Supabase Marketplace integration
// writes, are not the same. Accepting both is the difference between a deploy
// that works on the first click and one that fails with an empty page until the
// operator figures out which of two similarly-named keys goes where.
//
//   ours                            the integration's
//   NEXT_PUBLIC_SUPABASE_ANON_KEY   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   SUPABASE_SERVICE_ROLE_KEY       SUPABASE_SECRET_KEY
//
// Only NEXT_PUBLIC_* names can be used for the browser key: Next inlines those
// at build time, and a server-only alias would simply be undefined in the
// client bundle. The URL needs no alias — the integration already writes
// NEXT_PUBLIC_SUPABASE_URL.

type Env = Record<string, string | undefined>;

/** First non-blank value, or "" — a whitespace-only var must not read as configured. */
function firstSet(...values: (string | undefined)[]): string {
  for (const v of values) {
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return "";
}

/** The browser-side Supabase key: our anon key, or the integration's publishable one. */
export function pickSupabaseKey(e: Env): string {
  return firstSet(
    e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

/** The server-side privileged key: our service-role key, or the integration's secret key. */
export function pickServiceKey(e: Env): string {
  return firstSet(e.SUPABASE_SERVICE_ROLE_KEY, e.SUPABASE_SECRET_KEY);
}
