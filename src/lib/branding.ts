// Server-only: the site's editable branding (name + tagline), read from
// site_settings and cached so every page render isn't a DB round-trip. Static
// pages bake the result in; a settings save busts BRANDING_TAG and revalidates
// the layout, so the change propagates. Empty values fall back to the built-in
// defaults, so an untouched install is unchanged.
import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const BRANDING_TAG = "site-branding";

export type Branding = { name: string; tagline: string };

export const getBranding = unstable_cache(
  async (): Promise<Branding> => {
    const supabase = getAdminSupabase();
    if (!supabase) return { name: env.siteName, tagline: "" };
    const { data } = await supabase
      .from("site_settings")
      .select("site_name, tagline")
      .eq("id", 1)
      .maybeSingle();
    return {
      name: (data?.site_name as string)?.trim() || env.siteName,
      tagline: (data?.tagline as string)?.trim() || "",
    };
  },
  ["site-branding"],
  { tags: [BRANDING_TAG] },
);
