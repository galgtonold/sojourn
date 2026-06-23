// Server-only: the site's editable branding, read from site_settings and cached
// so every page render isn't a DB round-trip. Static pages bake the result in; a
// settings save busts BRANDING_TAG and revalidates the layout, so the change
// propagates. The name is a single value; the rest is per-language (de/en) with
// empty meaning "use the localized default", so an untouched install is unchanged.
import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import type { LangPair } from "@/lib/i18n";

export const BRANDING_TAG = "site-branding";

export type Branding = {
  name: string;
  tagline: LangPair;
  heroLead: LangPair;
  heroAccent: LangPair;
  kicker: LangPair;
};

const empty = (): LangPair => ({ de: "", en: "" });

export const getBranding = unstable_cache(
  async (): Promise<Branding> => {
    const blank: Branding = {
      name: env.siteName,
      tagline: empty(),
      heroLead: empty(),
      heroAccent: empty(),
      kicker: empty(),
    };
    const supabase = getAdminSupabase();
    if (!supabase) return blank;
    const { data } = await supabase
      .from("site_settings")
      .select(
        "site_name, tagline_de, tagline_en, hero_lead_de, hero_lead_en, hero_accent_de, hero_accent_en, kicker_de, kicker_en",
      )
      .eq("id", 1)
      .maybeSingle();
    if (!data) return blank;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = data as any;
    const pair = (k: string): LangPair => ({
      de: (s[`${k}_de`] as string)?.trim() || "",
      en: (s[`${k}_en`] as string)?.trim() || "",
    });
    return {
      name: (s.site_name as string)?.trim() || env.siteName,
      tagline: pair("tagline"),
      heroLead: pair("hero_lead"),
      heroAccent: pair("hero_accent"),
      kicker: pair("kicker"),
    };
  },
  ["site-branding"],
  { tags: [BRANDING_TAG] },
);
