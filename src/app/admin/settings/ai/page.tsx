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
import { T } from "@/components/i18n";
import { defaultTitle } from "@/lib/i18n";

export const metadata = { title: defaultTitle("admin.settings.aiHeading") };
export const dynamic = "force-dynamic";

// Just the plumbing: which provider, which key, which model. The writing-style
// guide lived here for a day and has moved to its own area — it reads as a
// personal setting, not a credential, whatever the technical dependency.
export default async function AiSettingsPage() {
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
    </>
  );
}
