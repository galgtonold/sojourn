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

// The platform's own function timeout must exceed TIMEOUT_MS, or the platform
// kills the invocation before the internal AbortSignal ever fires — trading a
// graceful `{ ok: false, detail }` for a raw platform 504 in exactly the
// slow/hanging-provider case this route exists to handle gracefully.
export const maxDuration = 20;

// Machine-readable so the UI can localize copy this route has no business
// authoring (user-facing strings live in src/lib/i18n.ts). `detail` stays
// reserved for genuine provider diagnostic text.
export type TestResult =
  | { ok: true; detail: string }
  | { ok: false; detail: string; reason?: "no-key" | "failed" };

// Some OpenAI-compatible APIs echo the submitted key (sometimes partially
// masked) back in a 401 body, and `detail` is rendered straight to the owner —
// the "never contains the key" property has to hold against that provider text
// too, not just against strings this route authors itself. A short/empty key
// would turn a global replace into a scrub of common substrings instead of a
// targeted redaction, so it's skipped below a sane minimum length.
function redactKey(text: string, key: string): string {
  if (!key || key.length < 8) return text;
  return text.replaceAll(key, "[redacted]");
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
  const cfg = await getAiConfig();
  // Used only to redact the catch-all below against whichever provider was
  // actually called; the key never appears in a URL for any of these clients
  // (deepseek.ts / embeddings.ts / enrich.ts all send it via the Authorization
  // header only), but a fetch TypeError is still scrubbed defensively.
  const key =
    input.group === "deepseek"
      ? cfg.deepseekApiKey
      : input.group === "embedding"
        ? cfg.embeddingApiKey
        : cfg.visionApiKey;

  try {
    if (input.group === "deepseek") {
      if (!cfg.isAiConfigured) return { ok: false, reason: "no-key", detail: "" };
      const err = await probe(`${cfg.deepseekBaseUrl}/chat/completions`, cfg.deepseekApiKey, {
        model: cfg.deepseekModelFast,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
      return err ? { ok: false, detail: err } : { ok: true, detail: cfg.deepseekModelFast };
    }

    if (input.group === "embedding") {
      if (!cfg.isEmbeddingsConfigured) return { ok: false, reason: "no-key", detail: "" };
      const err = await probe(`${cfg.embeddingBaseUrl}/embeddings`, cfg.embeddingApiKey, {
        model: cfg.embeddingModel,
        input: "ping",
      });
      return err ? { ok: false, detail: err } : { ok: true, detail: cfg.embeddingModel };
    }

    if (!cfg.isVisionConfigured) return { ok: false, reason: "no-key", detail: "" };
    const err = await probe(`${cfg.visionBaseUrl}/chat/completions`, cfg.visionApiKey, {
      model: cfg.visionModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    return err ? { ok: false, detail: err } : { ok: true, detail: cfg.visionModel };
  } catch (e) {
    // A DNS failure / timeout / bad base URL lands here — still a result.
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: "failed", detail: redactKey(message, key).slice(0, 200) };
  }
});
