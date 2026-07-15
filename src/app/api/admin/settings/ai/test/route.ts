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

async function probe(url: string, key: string, body: unknown): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return "";
  const detail = await res.text().catch(() => "");
  return `${res.status}: ${detail.slice(0, 200)}`;
}

export const POST = ownerRoute(schema, async ({ input }) => {
  const cfg = await getAiConfig();

  try {
    if (input.group === "deepseek") {
      if (!cfg.isAiConfigured) return { ok: false, detail: "no key" };
      const err = await probe(`${cfg.deepseekBaseUrl}/chat/completions`, cfg.deepseekApiKey, {
        model: cfg.deepseekModelFast,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      });
      return err ? { ok: false, detail: err } : { ok: true, detail: cfg.deepseekModelFast };
    }

    if (input.group === "embedding") {
      if (!cfg.isEmbeddingsConfigured) return { ok: false, detail: "no key" };
      const err = await probe(`${cfg.embeddingBaseUrl}/embeddings`, cfg.embeddingApiKey, {
        model: cfg.embeddingModel,
        input: "ping",
      });
      return err ? { ok: false, detail: err } : { ok: true, detail: cfg.embeddingModel };
    }

    if (!cfg.isVisionConfigured) return { ok: false, detail: "no key" };
    const err = await probe(`${cfg.visionBaseUrl}/chat/completions`, cfg.visionApiKey, {
      model: cfg.visionModel,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
    });
    return err ? { ok: false, detail: err } : { ok: true, detail: cfg.visionModel };
  } catch (e) {
    // A DNS failure / timeout / bad base URL lands here — still a result.
    return { ok: false, detail: e instanceof Error ? e.message.slice(0, 200) : "failed" };
  }
});
