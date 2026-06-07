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
    });
  } catch {
    /* metering is best effort */
  }
}
