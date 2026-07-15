// The Edge side of the app's AI config. app_secrets overrides the function's own
// env, so a key set once in /admin/settings reaches BOTH the Next.js app and
// these functions — otherwise the UI would configure drafting while llm-call and
// translate quietly kept using a stale env key.
//
// The key names and defaults here MUST match src/lib/ai-config-fields.ts
// (AI_FIELD_KEYS / AI_DEFAULTS): the two sides read the same rows, and a typo
// on either side diverges silently rather than failing loudly.
//
// Cached in module scope with a short TTL rather than tag invalidation: edge
// instances are reused, and there's no cheap way to push a bust across the
// network boundary. A key change takes effect within TTL_MS.
import { createClient } from "jsr:@supabase/supabase-js@2";

export type EdgeAiConfig = {
  apiKey: string;
  baseUrl: string;
  fastModel: string;
};

const TTL_MS = 60_000;
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_FAST_MODEL = "deepseek-v4-flash";

let cache: { at: number; value: EdgeAiConfig } | null = null;

async function readSecrets(): Promise<Record<string, string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return {};
  try {
    const supabase = createClient(url, key);
    const { data } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["deepseekApiKey", "deepseekBaseUrl", "deepseekModelFast"]);
    const out: Record<string, string> = {};
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      if (row.value?.trim()) out[row.key] = row.value.trim();
    }
    return out;
  } catch {
    // Never let a config read break a generation: fall back to env.
    return {};
  }
}

export async function getEdgeAiConfig(): Promise<EdgeAiConfig> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  const db = await readSecrets();
  const value: EdgeAiConfig = {
    apiKey: db.deepseekApiKey || Deno.env.get("DEEPSEEK_API_KEY") || "",
    baseUrl:
      db.deepseekBaseUrl || Deno.env.get("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL,
    fastModel:
      db.deepseekModelFast ||
      Deno.env.get("DEEPSEEK_MODEL_FAST") ||
      DEFAULT_FAST_MODEL,
  };
  cache = { at: now, value };
  return value;
}
