// Which analytics provider a deployment uses, and who gets to decide.
//
// Pure, so both the server (resolving what to render) and the settings form
// (validating what to save) share one definition and one precedence rule.
//
// Error reporting is deliberately NOT here. Sentry stays an environment
// variable on both halves: only a developer ever wants it, a developer is
// comfortable setting a variable, and the server side genuinely cannot move —
// instrumentation.ts calls Sentry.init once per process at boot, so a value
// read from the database later could never reconfigure it. A switch that
// silently does nothing is worse than no switch.

/** Everything the settings UI offers. "none" is a real, storable choice. */
export const ANALYTICS_PROVIDERS = ["none", "vercel"] as const;

export type AnalyticsProvider = (typeof ANALYTICS_PROVIDERS)[number];

export function isAnalyticsProvider(v: unknown): v is AnalyticsProvider {
  return (
    typeof v === "string" &&
    (ANALYTICS_PROVIDERS as readonly string[]).includes(v)
  );
}

/**
 * The effective provider: DB → env → off.
 *
 * The same rule the AI config uses (`own()` in @/lib/ai-config-fields), so a
 * value set in /admin/settings overrides the deployment's variable and an
 * install that has never opened settings keeps whatever its env said.
 *
 * Storing "none" is what lets an owner turn OFF analytics that an environment
 * variable turned on, without touching the deployment — which is the whole
 * point of moving this into the UI. That is why blank and "none" mean
 * different things here: blank is "never decided", "none" is "decided no".
 *
 * An unrecognised value from either source resolves to off rather than being
 * passed through: a typo in an env var should lose analytics, not load
 * something nobody vetted.
 */
export function resolveAnalytics(
  stored: string | null | undefined,
  fromEnv: string | null | undefined,
  opts: { onVercel?: boolean } = {},
): AnalyticsProvider {
  const db = (stored ?? "").trim();
  const env = (fromEnv ?? "").trim();
  const chosen = db
    ? isAnalyticsProvider(db)
      ? db
      : "none"
    : isAnalyticsProvider(env)
      ? env
      : "none";

  // Vercel Analytics is served BY Vercel: the script lives at
  // /_vercel/insights/script.js on their platform, so anywhere else it is a
  // 404 on every page view and no data at all — measured, not assumed. Someone
  // who enabled it and later moved to a VPS, or who is running the same build
  // locally, gets it switched off rather than a failing request per visit.
  if (chosen === "vercel" && opts.onVercel === false) return "none";
  return chosen;
}

/** Providers that can actually work on this host, for the settings UI to offer. */
export function availableAnalytics(
  opts: { onVercel: boolean },
): readonly AnalyticsProvider[] {
  return opts.onVercel ? ANALYTICS_PROVIDERS : ["none"];
}
