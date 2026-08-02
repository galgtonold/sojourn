// Server-only: the site's editable branding, read from site_settings and cached
// so every page render isn't a DB round-trip. Static pages bake the result in; a
// settings save busts BRANDING_TAG and revalidates the layout, so the change
// propagates. The flat↔nested field mapping lives in @/lib/branding-fields.
import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import {
  BRANDING_COLUMNS,
  parseBrandingRow,
  type Branding,
} from "@/lib/branding-fields";
import {
  resolveAnalytics,
  type AnalyticsProvider,
} from "@/lib/telemetry-fields";

export const BRANDING_TAG = "site-branding";
export type { Branding };

/**
 * Time bound on both caches below, for the reason `getAiConfig` has one
 * (@/lib/ai-config): the cache key carries no build ID, so Vercel's Data Cache
 * survives a deploy, and only a settings save busts the tag. Anything that
 * writes `site_settings` from outside the app — a seed script, psql, a restore
 * — therefore never invalidated anything, and no number of redeploys helped.
 *
 * That is not hypothetical. It is how the demo ended up serving its journeys
 * under the placeholder name from before it was seeded: prerendered pages were
 * rebuilt with the real branding on every deploy, while request-time renders
 * kept reading the entry cached before the seed ran. Static pages said one
 * thing and dynamic pages the other, indefinitely.
 *
 * Five minutes is a generous bound for copy that changes a few times a year,
 * and saving from /admin/settings still busts the tag for an instant update.
 */
const BRANDING_TTL = 300;

// A version suffix on the cache keys, bumped when the shape or the caching
// rules change. It orphans entries written under the old rules — without it the
// already-stored, never-expiring values above would have outlived this fix.
const KEY = "v2";

/** Whether the owner has actually chosen these, which `getBranding` cannot say:
 *  an unset name reads back as `env.siteName`, indistinguishable from someone
 *  who typed it. Cached under the same tag, so saving settings refreshes it. */
export const getBrandingState = unstable_cache(
  async (): Promise<{ nameSet: boolean; taglineSet: boolean }> => {
    const supabase = getAdminSupabase();
    if (!supabase) return { nameSet: false, taglineSet: false };
    const { data } = await supabase
      .from("site_settings")
      .select("site_name, tagline_de, tagline_en")
      .eq("id", 1)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    const set = (v: unknown) => Boolean((v as string | undefined)?.trim());
    return {
      nameSet: set(row.site_name),
      // Either language counts — nagging a one-language site for the other
      // would never clear.
      taglineSet: set(row.tagline_de) || set(row.tagline_en),
    };
  },
  ["site-branding-state", KEY],
  { tags: [BRANDING_TAG], revalidate: BRANDING_TTL },
);

export const getBranding = unstable_cache(
  async (): Promise<Branding> => {
    const supabase = getAdminSupabase();
    if (!supabase) return parseBrandingRow(null, env.siteName);
    const { data } = await supabase
      .from("site_settings")
      .select(BRANDING_COLUMNS.join(", "))
      .eq("id", 1)
      .maybeSingle();
    return parseBrandingRow(
      data as Record<string, unknown> | null,
      env.siteName,
    );
  },
  ["site-branding", KEY],
  { tags: [BRANDING_TAG], revalidate: BRANDING_TTL },
);

/**
 * Which analytics provider this deployment uses — the owner's choice from
 * /admin/settings, falling back to NEXT_PUBLIC_ANALYTICS (see
 * @/lib/telemetry-fields for the precedence).
 *
 * Its own cached read rather than a field on `getBranding`, because it isn't
 * branding and folding it in would mean every caller of branding carries a
 * telemetry setting around. Same tag, same TTL, same one-row table — so a
 * settings save busts both together and the cost is one small query per five
 * minutes, not one per render.
 */
export const getAnalyticsProvider = unstable_cache(
  async (): Promise<AnalyticsProvider> => {
    const opts = { onVercel: env.onVercel };
    const supabase = getAdminSupabase();
    if (!supabase) return resolveAnalytics(null, env.analytics, opts);
    const { data } = await supabase
      .from("site_settings")
      .select("analytics_provider")
      .eq("id", 1)
      .maybeSingle();
    return resolveAnalytics(
      (data as { analytics_provider?: string } | null)?.analytics_provider,
      env.analytics,
      opts,
    );
  },
  ["site-analytics", KEY],
  { tags: [BRANDING_TAG], revalidate: BRANDING_TTL },
);
