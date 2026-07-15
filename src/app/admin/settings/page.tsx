import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { env } from "@/lib/env";
import { readAiSecrets } from "@/lib/ai-config";
import {
  AI_FIELD_KEYS,
  isSecretField,
  maskSecret,
  readAiEnv,
  resolveAiConfig,
  resolveAiSources,
  type AiFieldKey,
} from "@/lib/ai-config-fields";
import { WritingStyleForm } from "@/components/writing-style-form";
import { AiProvidersForm, type AiFieldState } from "@/components/ai-providers-form";
import { BrandingForm } from "@/components/branding-form";
import { T, DocumentTitle } from "@/components/i18n";
import { defaultTitle, translate, type DictKey } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.title") };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer.isOwner) redirect("/admin");

  // Resolved here rather than via the cached getAiConfig() so one DB read backs
  // both the config and the per-field provenance, and so the section reflects a
  // just-saved value instead of whatever the cache still holds.
  const aiDb = await readAiSecrets();
  const aiRaw = readAiEnv();
  const aiCfg = resolveAiConfig(aiDb, aiRaw);
  const aiSources = resolveAiSources(aiDb, aiRaw);
  // The same shape the GET returns, so the section paints without a client
  // round-trip. Secret values stop here: only a mask crosses to the browser.
  const aiFields = Object.fromEntries(
    AI_FIELD_KEYS.map((k) => [
      k,
      {
        source: aiSources[k],
        value: isSecretField(k) ? "" : aiCfg[k],
        masked: isSecretField(k) ? maskSecret(aiCfg[k]) : "",
      },
    ]),
  ) as Record<AiFieldKey, AiFieldState>;

  const supabase = await getServerSupabase();
  const { data } = await supabase!
    .from("site_settings")
    .select(
      "writing_style, site_name, tagline_de, tagline_en, hero_lead_de, hero_lead_en, hero_accent_de, hero_accent_en, kicker_de, kicker_en",
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
    <div className="mx-auto max-w-3xl px-6 pb-24 pt-28">
      <DocumentTitle k="admin.settings.title" />
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> <T k="admin.dashboardLink" />
      </Link>

      <h1 className="font-display text-4xl font-semibold">
        <T k="admin.settings.brandHeading" />
      </h1>
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

      <h2 className="mt-14 font-display text-3xl font-semibold">
        <T k="admin.settings.aiHeading" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.aiIntro" />
      </p>
      {!aiCfg.isAiConfigured && (
        <p className="mt-3 rounded-xl border border-ember-500/30 bg-ember-500/10 px-4 py-3 text-sm text-ember-200">
          <T k="admin.settings.aiOff" />
        </p>
      )}
      <div className="mt-8">
        <AiProvidersForm initial={aiFields} />
      </div>

      <h2 className="mt-14 font-display text-3xl font-semibold">
        <T k="admin.settings.styleHeading" />
      </h2>
      <p className="mt-2 max-w-2xl text-sand-100/60">
        <T k="admin.settings.styleIntro" />
      </p>
      <div className="mt-8">
        <WritingStyleForm
          initial={(data?.writing_style as string) ?? ""}
          aiConfigured={aiCfg.isAiConfigured}
        />
      </div>
    </div>
  );
}
