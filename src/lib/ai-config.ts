// Server-only: the effective AI provider config — app_secrets overrides layered
// over env — cached so an AI call isn't a DB round-trip. A settings save busts
// AI_CONFIG_TAG. The resolution rules live in @/lib/ai-config-fields; this is
// only the read. Mirrors branding.ts / branding-fields.ts.
//
// Without a service-role key there is no way to read app_secrets, so this
// degrades to env-only — which is exactly what tests and any service-role-less
// deploy get, and why it never throws.
import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import {
  AI_FIELD_KEYS,
  readAiEnv,
  resolveAiConfig,
  resolveAiSources,
  type AiConfig,
  type AiDbValues,
  type AiFieldKey,
  type AiSource,
} from "@/lib/ai-config-fields";

export const AI_CONFIG_TAG = "ai-config";
export type { AiConfig };

/** The stored overrides, or {} when the service role isn't configured. */
export async function readAiSecrets(): Promise<AiDbValues> {
  const supabase = getAdminSupabase();
  if (!supabase) return {};
  const { data } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", [...AI_FIELD_KEYS]);
  const known = new Set<string>(AI_FIELD_KEYS);
  const out: AiDbValues = {};
  for (const row of (data ?? []) as { key: string; value: string }[]) {
    if (known.has(row.key)) out[row.key as AiFieldKey] = row.value;
  }
  return out;
}

export const getAiConfig = unstable_cache(
  async (): Promise<AiConfig> => resolveAiConfig(await readAiSecrets(), readAiEnv()),
  ["ai-config"],
  { tags: [AI_CONFIG_TAG] },
);

/** Per-field provenance for the settings page. Uncached — one page reads it. */
export async function getAiSources(): Promise<Record<AiFieldKey, AiSource>> {
  return resolveAiSources(await readAiSecrets(), readAiEnv());
}
