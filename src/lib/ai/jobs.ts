// Server-only: enqueue a (potentially slow) model call as an `ai_jobs` row.
//
// When the Edge Function is configured the call runs there — off Vercel's
// request clock — and the row is filled in the background; otherwise we run it
// synchronously here and mark the row done. Either way the caller gets a jobId
// to poll, so the client orchestration is identical in both modes.
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env, isEdgeJobConfigured } from "@/lib/env";
import {
  deepseekChat,
  type ChatMessage,
  type UsageMeta,
} from "@/lib/ai/deepseek";

export type LlmRequest = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

export async function enqueueLlmJob(
  req: LlmRequest,
  meta?: UsageMeta,
): Promise<{ jobId: string }> {
  const admin = getAdminSupabase();
  if (!admin) throw new Error("ai_jobs requires the service role key");

  const { data: job, error } = await admin
    .from("ai_jobs")
    .insert({
      status: "pending",
      model: req.model,
      input: {
        messages: req.messages,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        json: req.json,
      },
      post_id: meta?.postId ?? null,
      user_id: meta?.userId ?? null,
    })
    .select("id")
    .single();
  if (error || !job) throw new Error(error?.message ?? "could not enqueue job");
  const jobId = job.id as string;

  // Hand the slow call to the Edge Function and return immediately.
  if (isEdgeJobConfigured) {
    try {
      const res = await fetch(env.edgeFunctionUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-edge-secret": env.edgeSharedSecret,
        },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok || res.status === 202) return { jobId };
      // Non-2xx trigger → fall through to the synchronous path.
    } catch {
      /* fall through */
    }
  }

  // Fallback: run it here and store the result (subject to this route's own
  // time limit, exactly like the pre-Edge behaviour).
  try {
    const output = await deepseekChat({ ...req, meta });
    await admin
      .from("ai_jobs")
      .update({ status: "done", output })
      .eq("id", jobId);
  } catch (e) {
    await admin
      .from("ai_jobs")
      .update({
        status: "error",
        error: String((e as Error)?.message ?? e).slice(0, 500),
      })
      .eq("id", jobId);
  }
  return { jobId };
}
