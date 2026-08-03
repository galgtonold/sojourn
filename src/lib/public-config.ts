// The configuration the browser needs, resolved at runtime rather than baked in.
//
// ── Why this exists ─────────────────────────────────────────────────────────
//
// Next replaces every `process.env.NEXT_PUBLIC_*` with a string literal at build
// time. That is fine when the person building is the person deploying — on
// Vercel, and for `docker compose up --build`, they are. It stops being fine the
// moment we publish an image: a prebuilt `sojourn:latest` would carry whatever
// Supabase URL our CI happened to have into every visitor's JavaScript. You can
// see it in any build of this repo:
//
//   grep -l "$YOUR_SUPABASE_URL" .next/static/chunks/*.js   → matches
//
// So the server reads the real environment at process start and hands the result
// to the browser through a single inline script. One image, any deployment.
//
// ── Why the non-prefixed names come first ───────────────────────────────────
//
// `NEXT_PUBLIC_*` is unreliable *on the server too*: the same build-time
// substitution reaches most server chunks, so reading one there can return the
// value the image was built with rather than the one the container was given.
// Names without the prefix are never rewritten, so they are the only ones
// guaranteed to be live at runtime. They are also, conveniently, exactly what
// the Vercel Supabase integration already writes (`SUPABASE_URL`,
// `SUPABASE_ANON_KEY`) — so honouring them costs nothing and helps that path.
//
// Existing deployments keep working untouched: nothing here is required, and
// when a value is absent the client falls back to whatever was inlined at build
// time (see @/lib/env).

export const CONFIG_GLOBAL = "__SOJOURN_CONFIG__";

/** Everything client code is allowed to know. Server-only secrets stay in @/lib/env. */
export type PublicConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteName: string;
  siteUrl: string;
  mapStyleUrl: string;
  vapidPublicKey: string;
  sentryDsnClient: string;
  demoMode: boolean;
};

export const DEFAULT_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

type Env = Record<string, string | undefined>;

/**
 * A URL that RFC 2606 guarantees can never resolve — `.invalid`.
 *
 * `next build` cannot prerender without *some* Supabase URL, because the client
 * wrappers throw rather than quietly serve an empty page. So CI and the Docker
 * image build both supply one, and both use `.invalid` so it can never point at
 * anything real.
 *
 * The two sides want opposite answers about it, which is why this is a
 * predicate rather than a filter:
 *
 *   at BUILD time it must read as configured, or there is no build at all;
 *   in the BROWSER it must not, or a published image sends every visitor to a
 *   hostname that fails DNS instead of saying plainly that nobody configured it.
 *
 * So `publicConfigFromEnv` accepts it and `mergePublicConfig` discards it.
 */
export function isPlaceholderUrl(value: string): boolean {
  try {
    return new URL(value).hostname.endsWith(".invalid");
  } catch {
    return false;
  }
}

/** First non-blank value, or "". A whitespace-only var must not read as set. */
function firstSet(...values: (string | undefined)[]): string {
  for (const v of values) if (typeof v === "string" && v.trim() !== "") return v;
  return "";
}

/**
 * Read the environment as it actually is right now.
 *
 * Server-side only, and deliberately indexes `process.env` dynamically rather
 * than naming `process.env.NEXT_PUBLIC_X` literally — a literal would be
 * substituted at build time, which is the exact behaviour this module exists to
 * escape.
 *
 * @param e usually `process.env`
 */
export function publicConfigFromEnv(e: Env): PublicConfig {
  const siteUrl = firstSet(
    e.SITE_URL,
    e.NEXT_PUBLIC_SITE_URL,
    // Set by Vercel, and the reason a deploy there needs no site URL at all.
    e.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${e.VERCEL_PROJECT_PRODUCTION_URL}`
      : "",
    "http://localhost:3000",
  );

  return {
    supabaseUrl: firstSet(e.SUPABASE_URL, e.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: firstSet(
      // The integration's spellings and ours, in both prefixed and bare form.
      e.SUPABASE_ANON_KEY,
      e.SUPABASE_PUBLISHABLE_KEY,
      e.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      e.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
    siteName: firstSet(e.SITE_NAME, e.NEXT_PUBLIC_SITE_NAME, "Sojourn"),
    siteUrl,
    mapStyleUrl: firstSet(
      e.MAP_STYLE_URL,
      e.NEXT_PUBLIC_MAP_STYLE_URL,
      DEFAULT_MAP_STYLE,
    ),
    vapidPublicKey: firstSet(e.VAPID_PUBLIC_KEY, e.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    sentryDsnClient: firstSet(e.SENTRY_DSN_CLIENT, e.NEXT_PUBLIC_SENTRY_DSN),
    demoMode: firstSet(e.DEMO_MODE, e.NEXT_PUBLIC_DEMO_MODE) === "1",
  };
}

/**
 * The inline script that carries the config into the page.
 *
 * `<` is escaped because a value containing `</script>` would otherwise close
 * the tag and turn operator-supplied configuration into markup. These values
 * come from the operator's own environment rather than from a visitor, so this
 * is defence in depth rather than a live hole — but it costs one replace.
 */
export function publicConfigScript(config: PublicConfig): string {
  const json = JSON.stringify(config).replace(/</g, "\\u003c");
  return `window.${CONFIG_GLOBAL}=${json}`;
}

/**
 * What the script left behind, or null when there isn't any — during SSR, or in
 * a build that predates this. Callers fall back to the build-time values.
 */
export function injectedPublicConfig(): PublicConfig | null {
  if (typeof window === "undefined") return null;
  const raw = (window as unknown as Record<string, unknown>)[CONFIG_GLOBAL];
  return raw && typeof raw === "object" ? (raw as PublicConfig) : null;
}

/**
 * Injected values win, but only where they say something.
 *
 * Field by field rather than whole-object, because of the statically
 * prerendered pages: the script is rendered into their HTML at BUILD time, so a
 * prebuilt image ships them carrying an empty config. Taking that object wholesale
 * would let an image's blank Supabase URL beat a perfectly good inlined one and
 * break pages that would otherwise have worked. An empty string is the absence
 * of an answer, not an answer of "".
 *
 * `demoMode` is merged as a boolean: false is a real answer there, and the flag
 * is only ever true on one deployment anyway.
 */
export function mergePublicConfig(
  injected: PublicConfig | null,
  inlined: PublicConfig,
): PublicConfig {
  if (!injected) return inlined;
  const inlinedUrl = isPlaceholderUrl(inlined.supabaseUrl)
    ? ""
    : inlined.supabaseUrl;
  return {
    supabaseUrl: injected.supabaseUrl || inlinedUrl,
    supabaseAnonKey: injected.supabaseAnonKey || inlined.supabaseAnonKey,
    siteName: injected.siteName || inlined.siteName,
    siteUrl: injected.siteUrl || inlined.siteUrl,
    mapStyleUrl: injected.mapStyleUrl || inlined.mapStyleUrl,
    vapidPublicKey: injected.vapidPublicKey || inlined.vapidPublicKey,
    sentryDsnClient: injected.sentryDsnClient || inlined.sentryDsnClient,
    demoMode: injected.demoMode ?? inlined.demoMode,
  };
}
