// Server-only AI usage recorder. Writes via the service role (bypasses RLS);
// the cost meter reads owner-only.
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  cache_hit_tokens: number;
  cache_miss_tokens: number;
  /**
   * Of `completion_tokens`, how many the model spent thinking before it began
   * the answer. Billed the same, invisible in the output, and the difference
   * between "it reasoned itself into the cap" and "it genuinely wrote that
   * much" — which are opposite bugs with opposite fixes. Undefined on providers
   * or models that do not report it.
   */
  reasoning_tokens?: number;
};

export function estimateCost(u: Usage): number {
  return (
    (u.cache_hit_tokens * env.aiPriceCacheHit +
      u.cache_miss_tokens * env.aiPriceCacheMiss +
      u.completion_tokens * env.aiPriceOutput) /
    1_000_000
  );
}

export async function recordUsage(input: {
  operation: string;
  model: string;
  usage: Usage;
  postId?: string | null;
  userId?: string | null;
  // Embeddings price per token differently from chat, so callers may supply an
  // exact cost; otherwise it's derived from the chat cache/output rates.
  costUsd?: number;
  // Why the completion stopped ("stop" | "length" | …). "length" means the
  // model hit the token cap and the output is truncated — the usual reason a
  // JSON step later fails to parse.
  finishReason?: string | null;
  /**
   * The first few hundred characters of what came back, recorded only when the
   * call failed. Empty is itself informative: a cap-truncated response usually
   * has no content at all, because reasoning is billed first and arrives first.
   */
  responsePreview?: string | null;
}): Promise<void> {
  try {
    const admin = getAdminSupabase();
    if (!admin) return;
    await admin.from("ai_usage").insert({
      operation: input.operation,
      model: input.model,
      post_id: input.postId ?? null,
      user_id: input.userId ?? null,
      prompt_tokens: input.usage.prompt_tokens,
      completion_tokens: input.usage.completion_tokens,
      cache_hit_tokens: input.usage.cache_hit_tokens,
      cache_miss_tokens: input.usage.cache_miss_tokens,
      cost_usd: input.costUsd ?? estimateCost(input.usage),
      ok: input.finishReason === "length" ? false : true,
      finish_reason: input.finishReason ?? null,
      reasoning_tokens: input.usage.reasoning_tokens ?? null,
      // Only on failure — a successful call's output is the post itself.
      response_preview:
        input.finishReason === "length"
          ? (input.responsePreview ?? "").slice(0, 600) || null
          : null,
    });
  } catch {
    /* metering is best effort */
  }
}

// Record an AI operation that failed before/without a usable response (an API
// error, a genuinely unparseable reply). Persisted so failures are diagnosable
// from the same table as usage, and logged for the runtime tail. Best effort.
export async function recordAiFailure(input: {
  operation: string;
  model: string;
  error: string;
  postId?: string | null;
  userId?: string | null;
  finishReason?: string | null;
  /**
   * The first few hundred characters of what came back, recorded only when the
   * call failed. Empty is itself informative: a cap-truncated response usually
   * has no content at all, because reasoning is billed first and arrives first.
   */
  responsePreview?: string | null;
}): Promise<void> {
  console.error(
    `[ai] ${input.operation} failed (${input.model}` +
      `${input.postId ? `, post ${input.postId}` : ""}` +
      `${input.finishReason ? `, finish_reason=${input.finishReason}` : ""}): ${input.error}`,
  );
  try {
    const admin = getAdminSupabase();
    if (!admin) return;
    await admin.from("ai_usage").insert({
      operation: input.operation,
      model: input.model,
      post_id: input.postId ?? null,
      user_id: input.userId ?? null,
      prompt_tokens: 0,
      completion_tokens: 0,
      cache_hit_tokens: 0,
      cache_miss_tokens: 0,
      cost_usd: 0,
      ok: false,
      error: input.error.slice(0, 500),
      finish_reason: input.finishReason ?? null,
      response_preview: (input.responsePreview ?? "").slice(0, 600) || null,
    });
  } catch {
    /* best effort */
  }
}
