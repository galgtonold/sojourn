// @ts-check
// How the migration runner reaches Postgres, and how it talks about it out loud.
//
// This is deliberately separate from @/lib/env: the app never opens a Postgres
// connection. It goes through PostgREST with the anon or service-role key, and
// PostgREST cannot execute DDL — which is the whole reason the runner needs a
// credential nothing else in Sojourn uses.
//
// Plain ESM for the same reason as ./migrations.mjs: scripts/migrate.mjs loads
// it on hosts with no TypeScript.

/**
 * Where a connection string came from, in preference order.
 *
 * `POSTGRES_URL_NON_POOLING` is the Vercel↔Supabase integration's *direct*
 * connection, and it is preferred over the pooled `POSTGRES_URL` sibling on
 * purpose — see `looksTransactionPooled` below for why that matters here and
 * nowhere else in the app.
 *
 * @type {readonly string[]}
 */
export const URL_VARS = [
  // Ours, and explicit: set this to override anything a platform injected.
  "SOJOURN_DATABASE_URL",
  // Written by the Vercel↔Supabase integration. Direct, not pooled.
  "POSTGRES_URL_NON_POOLING",
  // The conventional name; what a Docker or bare-metal operator will reach for.
  "DATABASE_URL",
  // Also from the integration, but pooled. Last resort.
  "POSTGRES_URL",
];

/**
 * The first configured connection string, with the variable it came from so
 * logs and error messages can name the thing the operator would edit.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, from: string } | null}
 */
export function resolveDatabaseUrl(env) {
  for (const name of URL_VARS) {
    const url = env[name]?.trim();
    if (url) return { url, from: name };
  }
  return null;
}

/**
 * Host and database, with the password removed.
 *
 * Build logs are not private — on Vercel they are visible to everyone with
 * project access, and a self-hoster's CI output may be public outright. The
 * runner prints where it connected on every run, so this is the only form of a
 * connection string it is ever allowed to print.
 *
 * @param {string} url
 * @returns {string}
 */
export function describeConnection(url) {
  try {
    const u = new URL(url);
    const db = u.pathname.replace(/^\//, "") || "postgres";
    return `${u.hostname}:${u.port || "5432"}/${db}`;
  } catch {
    return "(unparseable connection string)";
  }
}

/**
 * Is this a *transaction*-mode pooler?
 *
 * It matters because the runner holds one session-scoped advisory lock across
 * every migration it applies. Transaction pooling hands out a different backend
 * per transaction, so the lock would be taken on a connection nobody sees again
 * and released against one that never held it — leaving concurrent builds free
 * to apply the same migration twice.
 *
 * Supabase's session-mode pooler (port 5432 on `*.pooler.supabase.com`) is
 * fine; only the transaction pooler on 6543 is not.
 *
 * @param {string} url
 * @returns {boolean}
 */
export function looksTransactionPooled(url) {
  try {
    const u = new URL(url);
    return u.port === "6543" || u.searchParams.get("pgbouncer") === "true";
  } catch {
    return false;
  }
}

/**
 * TLS settings for a connection string.
 *
 * The driver already reads `sslmode` out of the URL itself and maps `require`,
 * `allow` and `prefer` to an encrypted-but-unverified connection — which is
 * what those modes mean in libpq, not a weakening we chose. So this only
 * supplies a default for URLs that say nothing, and `prefer` is the only answer
 * that suits every host we support: Supabase mandates TLS, while a Postgres
 * container next door in a compose file usually has none. `prefer` tries, then
 * falls back.
 *
 * @param {string} url
 * @returns {"prefer" | undefined} undefined leaves the URL's own sslmode alone
 */
export function sslDefaultFor(url) {
  try {
    return new URL(url).searchParams.has("sslmode") ? undefined : "prefer";
  } catch {
    return "prefer";
  }
}

/**
 * The advisory lock every Sojourn migration run takes.
 *
 * Arbitrary, but it must never change: two builds holding *different* keys are
 * two builds not excluding each other. Cast to bigint at the call site so
 * Postgres picks the single-argument overload rather than reading it as the
 * (int, int) pair.
 */
export const MIGRATION_LOCK_KEY = 2026080301;
