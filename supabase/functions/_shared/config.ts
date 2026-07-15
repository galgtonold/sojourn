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

// Mirrors the app's own env(k) trimming (src/lib/ai-config-fields.ts `clean`):
// without this, a whitespace-only env var is truthy and short-circuits the
// built-in default (e.g. DEEPSEEK_BASE_URL=" " -> fetch(" /chat/completions"),
// a TypeError the retry loop treats as retryable and burns all attempts on),
// and a padded key ("sk-x\n") would 401 on edge while working in-app.
function env(name: string): string {
  return Deno.env.get(name)?.trim() ?? "";
}

// `null` means the read FAILED (network/PostgREST error or no client at all
// could be built); `{}` means it succeeded and nothing is stored. Callers must
// not treat a failure as authoritative emptiness — see getEdgeAiConfig.
async function readSecrets(): Promise<Record<string, string> | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  // No service role configured is env-only by design (self-hoster with no DB
  // wiring), not a failure — {} is correct and authoritative here.
  if (!url || !key) return {};
  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("app_secrets")
      .select("key, value")
      .in("key", ["deepseekApiKey", "deepseekBaseUrl", "deepseekModelFast"]);
    // PostgREST errors RESOLVE the promise rather than throw, so this check is
    // load-bearing: without it, the catch below never sees the most likely
    // failure mode and a failed read silently reads back as "nothing stored".
    if (error) {
      console.warn(`app_secrets read failed: ${error.message}`);
      return null;
    }
    const out: Record<string, string> = {};
    for (const row of (data ?? []) as { key: string; value: string }[]) {
      if (row.value?.trim()) out[row.key] = row.value.trim();
    }
    return out;
  } catch (e) {
    console.warn(`app_secrets read failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function getEdgeAiConfig(): Promise<EdgeAiConfig> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;

  const db = await readSecrets();
  if (db === null) {
    // The read failed. If we have a cached value (however stale), it is still
    // better than re-deriving from env alone — a transient blip must not evict
    // a known-good DB-backed key. Deliberately do NOT touch cache.at: bumping
    // it would freeze the stale value for a full TTL_MS even though we never
    // confirmed it's still current, turning one blip into a minute of it. Not
    // updating it means the very next call retries the DB immediately.
    if (cache) return cache.value;
    // No prior cache either (e.g. cold start racing a DB blip) — fall back to
    // env/defaults for this call only; nothing is cached, so the next call
    // retries the DB rather than being pinned to this guess.
    return {
      apiKey: env("DEEPSEEK_API_KEY"),
      baseUrl: env("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL,
      fastModel: env("DEEPSEEK_MODEL_FAST") || DEFAULT_FAST_MODEL,
    };
  }

  const value: EdgeAiConfig = {
    apiKey: db.deepseekApiKey || env("DEEPSEEK_API_KEY"),
    baseUrl: db.deepseekBaseUrl || env("DEEPSEEK_BASE_URL") || DEFAULT_BASE_URL,
    fastModel:
      db.deepseekModelFast || env("DEEPSEEK_MODEL_FAST") || DEFAULT_FAST_MODEL,
  };
  // Only a successful read updates the cache — see the null branch above.
  cache = { at: now, value };
  return value;
}
