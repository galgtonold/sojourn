import { getServerSupabase } from "@/lib/supabase/server";
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
import { AiProvidersForm, type AiFieldState } from "@/components/ai-providers-form";
import { WritingStyleForm } from "@/components/writing-style-form";
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.aiHeading") };
export const dynamic = "force-dynamic";

// Provider keys and the writing-style guide on one page, because they are one
// subject: the guide exists only so AI drafts have a voice to match. They were
// two separate top-level sections before, which read as two unrelated features.
export default async function AiSettingsPage() {
  const supabase = await getServerSupabase();
  const [aiDb, { data }] = await Promise.all([
    // Resolved here rather than via the cached getAiConfig() so one DB read backs
    // both the config and the per-field provenance, and so the section reflects a
    // just-saved value instead of whatever the cache still holds.
    readAiSecrets(),
    supabase!.from("site_settings").select("writing_style").eq("id", 1).maybeSingle(),
  ]);
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

  return (
    <>
      <h2 className="font-display text-3xl font-semibold">
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
    </>
  );
}
