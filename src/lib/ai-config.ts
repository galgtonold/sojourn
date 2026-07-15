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
  type AiConfig,
  type AiDbValues,
  type AiFieldKey,
} from "@/lib/ai-config-fields";

export const AI_CONFIG_TAG = "ai-config";
export type { AiConfig };

/** The stored overrides, or {} when the service role isn't configured.
 *
 *  A failed read yields {} — i.e. "nothing stored" — which resolution then
 *  treats as env-only. That's a deliberate soft landing (an AI call must not
 *  500 on a DB blip), but it is NOT authoritative emptiness, so the warn below
 *  is the only trace that a self-hoster's UI-set keys vanished for a request.
 *  The Deno mirror (supabase/functions/_shared/config.ts) can distinguish the
 *  two because it owns its cache and can keep serving a known-good value; here
 *  unstable_cache offers no "compute but don't store" escape hatch, so the
 *  60s revalidate below is what bounds a cached failure instead. */
export async function readAiSecrets(
  // Callers that already hold a client (the settings GET builds one for its 503
  // gate) can pass it: getAdminSupabase() isn't memoized, so letting this
  // construct its own would mean two clients per request.
  client?: ReturnType<typeof getAdminSupabase>,
): Promise<AiDbValues> {
  const supabase = client ?? getAdminSupabase();
  if (!supabase) return {};
  // PostgREST errors RESOLVE rather than throw, so an unchecked `data` read
  // makes a failure indistinguishable from an empty table.
  const { data, error } = await supabase
    .from("app_secrets")
    .select("key, value")
    .in("key", [...AI_FIELD_KEYS]);
  if (error) {
    // Message only — a row's value is a secret and must never reach a log.
    console.warn(`app_secrets read failed: ${error.message}`);
    return {};
  }
  const out: AiDbValues = {};
  // No key filter: `.in("key", AI_FIELD_KEYS)` already constrains the rows.
  for (const row of (data ?? []) as { key: string; value: string }[]) {
    out[row.key as AiFieldKey] = row.value;
  }
  return out;
}

export const getAiConfig = unstable_cache(
  async (): Promise<AiConfig> => resolveAiConfig(await readAiSecrets(), readAiEnv()),
  ["ai-config"],
  // The cached value folds in an env read, and the cache key carries no build
  // ID, so Vercel's Data Cache survives a deploy. Only a settings PUT/DELETE
  // busts the tag — which an env-only deploy never calls. Without a time bound,
  // rotating DEEPSEEK_API_KEY in Vercel and redeploying would keep serving the
  // old key until a manual purge. 60s mirrors the Edge side's TTL_MS
  // (supabase/functions/_shared/config.ts), the staleness bound this design
  // already accepts; the tag bust still makes UI saves instant.
  { tags: [AI_CONFIG_TAG], revalidate: 60 },
);
