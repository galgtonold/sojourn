// Server-only embeddings client (OpenAI-compatible /embeddings API). Powers the
// semantic half of hybrid search. DeepSeek has no embeddings endpoint, hence a
// separate, configurable provider — point EMBEDDING_BASE_URL at a local
// OpenAI-compatible server (Ollama / TEI / llama.cpp) to run it keylessly.
import "server-only";
import { env } from "@/lib/env"; // still needed for embeddingDim + aiPriceEmbedding
import { getAiConfig, type AiConfig } from "@/lib/ai-config";
import { recordUsage } from "@/lib/ai/usage";
import type { UsageMeta } from "@/lib/ai/deepseek";

// Keep inputs comfortably under the model's context window. ~8k chars ≈ 2k
// tokens; embedding text is short metadata anyway, so this rarely trims.
const MAX_INPUT_CHARS = 8000;

function clip(s: string): string {
  return s.length > MAX_INPUT_CHARS ? s.slice(0, MAX_INPUT_CHARS) : s;
}

// pgvector accepts the bracketed form (`[1,2,3]`) but not Postgres array
// syntax, so always send embeddings as a JSON string for RPC args + updates.
export function toVectorLiteral(v: number[]): string {
  return JSON.stringify(v);
}

// The text we embed for a post / photo. Most salient fields go first so that, if
// clipping kicks in, the least important content is what gets dropped.
export function postEmbeddingInput(p: {
  title?: string | null;
  location?: string | null;
  place_index?: string | null;
  excerpt?: string | null;
  body?: string | null;
}): string {
  return clip(
    [p.title, p.location, p.place_index, p.excerpt, p.body]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

export function photoEmbeddingInput(p: {
  caption?: string | null;
  place_name?: string | null;
  nearby_places?: string[] | null;
  alt?: string | null;
  ai_description?: string | null;
}): string {
  return clip(
    [p.caption, p.place_name, (p.nearby_places ?? []).join(" "), p.alt, p.ai_description]
      .map((x) => (x ?? "").trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

type EmbeddingResponse = {
  data: { embedding: number[] }[];
  usage?: { prompt_tokens?: number; total_tokens?: number };
};

async function callEmbeddings(
  input: string[],
  cfg: AiConfig,
): Promise<EmbeddingResponse> {
  const res = await fetch(`${cfg.embeddingBaseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: cfg.embeddingModel,
      input,
      // OpenAI honours an explicit output size; servers that don't simply ignore it.
      ...(env.embeddingDim ? { dimensions: env.embeddingDim } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embeddings ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as EmbeddingResponse;
}

function meter(json: EmbeddingResponse, cfg: AiConfig, meta?: UsageMeta) {
  const tokens = json.usage?.total_tokens ?? json.usage?.prompt_tokens ?? 0;
  void recordUsage({
    operation: meta?.operation ?? "embed",
    model: cfg.embeddingModel,
    postId: meta?.postId,
    userId: meta?.userId,
    usage: {
      prompt_tokens: tokens,
      completion_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
    },
    costUsd: (tokens * env.aiPriceEmbedding) / 1_000_000,
  });
}

/** Embed a single string. Returns null when embeddings aren't configured or the
 *  text is blank, so callers can no-op gracefully. */
export async function embedText(
  text: string,
  meta?: UsageMeta,
): Promise<number[] | null> {
  const cfg = await getAiConfig();
  if (!cfg.isEmbeddingsConfigured) return null;
  const clean = text.trim();
  if (!clean) return null;
  const json = await callEmbeddings([clip(clean)], cfg);
  meter(json, cfg, meta);
  return json.data[0]?.embedding ?? null;
}

/** Embed many strings in one request, preserving order. Blank inputs (and the
 *  no-provider case) map to null. */
export async function embedBatch(
  texts: string[],
  meta?: UsageMeta,
): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = texts.map(() => null);
  const cfg = await getAiConfig();
  if (!cfg.isEmbeddingsConfigured) return out;

  // Send only non-blank inputs, remembering where each belongs.
  const positions: number[] = [];
  const payload: string[] = [];
  texts.forEach((t, i) => {
    const c = t.trim();
    if (c) {
      positions.push(i);
      payload.push(clip(c));
    }
  });
  if (payload.length === 0) return out;

  const json = await callEmbeddings(payload, cfg);
  meter(json, cfg, meta);
  json.data.forEach((d, i) => {
    out[positions[i]] = d.embedding;
  });
  return out;
}
