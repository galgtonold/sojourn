import { getServerSupabase } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { BrandingForm } from "@/components/branding-form";
import { T } from "@/components/i18n";
import { defaultTitle, translate, type DictKey } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.title") };
export const dynamic = "force-dynamic";

// What the site is called and how it introduces itself. Lives at the settings
// root because it is what a non-technical owner came here to change — and
// because /admin/settings should land somewhere, not redirect.
export default async function SiteSettingsPage() {
  const supabase = await getServerSupabase();
  const { data } = await supabase!
    .from("site_settings")
    .select(
      "site_name, tagline_de, tagline_en, hero_lead_de, hero_lead_en, hero_accent_de, hero_accent_en, kicker_de, kicker_en",
    )
    .eq("id", 1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = (data as any) ?? {};
  const pair = (k: string) => ({
    de: (s[`${k}_de`] as string) || "",
    en: (s[`${k}_en`] as string) || "",
  });
  const initial = {
    tagline: pair("tagline"),
    heroLead: pair("hero_lead"),
    heroAccent: pair("hero_accent"),
    kicker: pair("kicker"),
  };
  // Localized built-in copy, shown as placeholders / preview fallback per language.
  const def = (key: DictKey) => ({
    de: translate("de", key),
    en: translate("en", key),
  });
  const defaults = {
    tagline: def("footer.tagline"),
    heroLead: def("home.heroLeadA"),
    heroAccent: def("home.heroLeadB"),
    kicker: def("home.kicker"),
  };

  return (
    <>
      <h2 className="font-display text-3xl font-semibold">
        <T k="admin.settings.brandHeading" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.brandIntro" />
      </p>
      <div className="mt-8">
        <BrandingForm
          initialName={(s.site_name as string) || ""}
          defaultName={env.siteName}
          initial={initial}
          defaults={defaults}
        />
      </div>
    </>
  );
}
