// "Does this key actually work?" — one cheap live call per provider group,
// using the SAVED config (so it tests what the app will really use, including
// any env fallback). Always answers 200: a provider rejecting the key is a
// result to display, not a server error. `detail` is short and safe to show —
// provider errors echo status text, never the key.
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";
import { getAiConfig } from "@/lib/ai-config";

const schema = z.object({ group: z.enum(["deepseek", "embedding", "vision"]) });

const TIMEOUT_MS = 15_000;

// The platform's own function timeout must exceed TIMEOUT_MS with enough slack
// to also cover the owner gate, the admin client, and getAiConfig()'s DB read
// on a cold cache (unstable_cache misses hit Supabase) plus the response tail
// — 20 left only 5s for all of that, so this is 30. Sibling routes under
// src/app/api/admin/ai/* use 60/180, but those do real generation work; this
// route's own internal abort is fixed at 15s, so 30 is enough headroom without
// pretending this is as heavy as those.
export const maxDuration = 30;

// Machine-readable so the UI can localize copy this route has no business
// authoring (user-facing strings live in src/lib/i18n.ts). `detail` stays
// reserved for genuine provider diagnostic text. All three `ok: false` causes
// are named explicitly so "reason absent" can't silently stand in for a state
// — "rejected" is the provider having understood the request and said no.
export type TestResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string; reason: "no-key" | "failed" | "rejected" };

// Some OpenAI-compatible APIs echo the submitted key back in a 401 body, and
// `detail` is rendered straight to the owner, so an exact echo must never
// survive into it. What this actually covers: a byte-for-byte occurrence of
// the configured key in the provider text, plus (defense-in-depth) anything
// key-SHAPED — an `sk-`-prefixed token of plausible length — regardless of
// whether it matches the configured key, to catch a provider that only
// PARTIALLY masks its echo (e.g. `sk-abc***xyz`, which can't match the exact
// key). What it does NOT cover: a masked/partial fragment that doesn't happen
// to be `sk-`-shaped. That residual is accepted because a fragment the
// provider itself already redacted isn't the secret — the property this route
// exists to guarantee (the real key never reaches the owner's screen) still
// holds; only a cosmetic, provider-authored placeholder could slip through.
const KEY_SHAPED = /sk-[A-Za-z0-9*_-]{6,}/g;

function redactKey(text: string, key: string): string {
  // A short/empty key would turn a global replace into a scrub of common
  // substrings instead of a targeted redaction, so skip the exact-match pass
  // below a sane minimum length — real provider keys are far longer than 8
  // chars, so this only ever excludes empty/placeholder values, never a real
  // key.
  const exact = key.length >= 8 ? text.replaceAll(key, "[redacted]") : text;
  return exact.replace(KEY_SHAPED, "[redacted]");
}

async function probe(url: string, key: string, body: unknown): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return "";
  const detail = await res.text().catch(() => "");
  return `${res.status}: ${redactKey(detail, key).slice(0, 200)}`;
}

export const POST = ownerRoute(schema, async ({ input }): Promise<TestResult> => {
  // Declared outside the try so the catch below can still redact against
  // whichever key was in play — but read from inside the try, since
  // getAiConfig() itself does a Supabase read that can throw (network blip,
  // cold cache) and must land in the same always-200 path as a provider
  // rejection or a probe() network failure, not escape as a 502.
  let key = "";
  try {
    const cfg = await getAiConfig();
    // Used only to redact the catch-all below against whichever provider was
    // actually called; the key never appears in a URL for any of these clients
    // (deepseek.ts / embeddings.ts / enrich.ts all send it via the Authorization
    // header only), but a fetch TypeError is still scrubbed defensively.
    key =
      input.group === "deepseek"
        ? cfg.deepseekApiKey
        : input.group === "embedding"
          ? cfg.embeddingApiKey
          : cfg.visionApiKey;

    if (input.group === "deepseek") {
      if (!cfg.isAiConfigured) return { ok: false, reason: "no-key", detail: "" };
      const err = await probe(`${cfg.deepseekBaseUrl}/chat/completions`, cfg.deepseekApiKey, {
        model: cfg.deepseekModelFast,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
      return err
        ? { ok: false, reason: "rejected", detail: err }
        : { ok: true, detail: cfg.deepseekModelFast };
    }

    if (input.group === "embedding") {
      if (!cfg.isEmbeddingsConfigured) return { ok: false, reason: "no-key", detail: "" };
      const err = await probe(`${cfg.embeddingBaseUrl}/embeddings`, cfg.embeddingApiKey, {
        model: cfg.embeddingModel,
        input: "ping",
      });
      return err
        ? { ok: false, reason: "rejected", detail: err }
        : { ok: true, detail: cfg.embeddingModel };
    }

    if (!cfg.isVisionConfigured) return { ok: false, reason: "no-key", detail: "" };
    const err = await probe(`${cfg.visionBaseUrl}/chat/completions`, cfg.visionApiKey, {
      model: cfg.visionModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    return err
      ? { ok: false, reason: "rejected", detail: err }
      : { ok: true, detail: cfg.visionModel };
  } catch (e) {
    // A DNS failure / timeout / bad base URL / getAiConfig() DB blip all land
    // here — still a result, never a thrown error out of the handler.
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "failed", detail: redactKey(message, key).slice(0, 200) };
  }
});
