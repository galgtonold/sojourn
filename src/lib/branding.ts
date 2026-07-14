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

export const BRANDING_TAG = "site-branding";
export type { Branding };

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
  ["site-branding"],
  { tags: [BRANDING_TAG] },
);
