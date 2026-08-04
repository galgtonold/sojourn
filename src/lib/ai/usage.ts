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
  /** Opening of the model's chain-of-thought — what it was thinking about. */
  reasoningPreview?: string | null;
  /** Opening of what was SENT. Catches a prompt that drifted from the code. */
  requestPreview?: string | null;
  /** Round-trip time. "It hung" was unanswerable without this. */
  durationMs?: number | null;
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
      duration_ms: input.durationMs ?? null,
      // Content only when it is needed or asked for: on a truncated call, which
      // is exactly when nobody can see what happened, or with AI_DEBUG set.
      // Otherwise this table would carry a second copy of every draft.
      ...(input.finishReason === "length" || aiDebug()
        ? {
            response_preview: preview(input.responsePreview),
            reasoning_preview: preview(input.reasoningPreview),
            request_preview: preview(input.requestPreview),
          }
        : {}),
    });
  } catch {
    /* metering is best effort */
  }
}

// Record an AI operation that failed before/without a usable response (an API
// error, a genuinely unparseable reply). Persisted so failures are diagnosable
// from the same table as usage, and logged for the runtime tail. Best effort.
/**
 * Record request/response/reasoning text on SUCCESSFUL calls too.
 *
 * Off by default: these are fragments of the operator's own drafts and a
 * metering table is a poor place to keep a second copy of them. Worth turning on
 * while chasing something — a prompt that stopped matching the code, a model
 * that changed its mind about how much to think — and worth turning off after.
 */
function aiDebug(): boolean {
  return process.env.AI_DEBUG === "1";
}

/** Bounded, and null rather than "" so an empty column reads as "not recorded". */
function preview(v: string | null | undefined): string | null {
  return (v ?? "").slice(0, 2000) || null;
}

export async function recordAiFailure(input: {
  operation: string;
  model: string;
  error: string;
  postId?: string | null;
  userId?: string | null;
  finishReason?: string | null;
  responsePreview?: string | null;
  reasoningPreview?: string | null;
  requestPreview?: string | null;
  durationMs?: number | null;
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
      response_preview: preview(input.responsePreview),
      reasoning_preview: preview(input.reasoningPreview),
      request_preview: preview(input.requestPreview),
      duration_ms: input.durationMs ?? null,
    });
  } catch {
    /* best effort */
  }
}
