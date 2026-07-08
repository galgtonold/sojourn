// Thin async LLM wrapper. The Next.js side enqueues an `ai_jobs` row and POSTs
// `{ jobId }` here; this function runs the (slow) model call in the background
// via EdgeRuntime.waitUntil — which has a far longer wall-clock budget than a
// Vercel function — and writes the result back to the row. Returns 202 at once.
//
// Auth is a shared secret (x-edge-secret), so deploy with verify_jwt = false.
// Secrets needed: EDGE_SHARED_SECRET, DEEPSEEK_API_KEY, (optional DEEPSEEK_BASE_URL).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { chatCompletion } from "../_shared/deepseek.ts";

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("EDGE_SHARED_SECRET");
  if (!secret || req.headers.get("x-edge-secret") !== secret) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    /* no body */
  }
  if (!jobId) {
    return new Response(JSON.stringify({ error: "jobId required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const work = (async () => {
    try {
      const { data: job } = await supabase
        .from("ai_jobs")
        .select("model, input")
        .eq("id", jobId)
        .maybeSingle();
      if (!job) return;
      const input = (job.input ?? {}) as {
        messages?: unknown;
        temperature?: number;
        maxTokens?: number;
        json?: boolean;
      };

      // Shared client: one retry policy across the edge functions (5xx + 429 +
      // 408 with backoff), so a rate-limit blip in a burst of section calls
      // doesn't lose the job.
      const output = await chatCompletion({
        model: job.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        maxTokens: input.maxTokens,
        json: input.json,
      });

      await supabase
        .from("ai_jobs")
        .update({ status: "done", output, error: null })
        .eq("id", jobId);
    } catch (e) {
      await supabase
        .from("ai_jobs")
        .update({
          status: "error",
          error: String((e as Error)?.message ?? e).slice(0, 500),
        })
        .eq("id", jobId);
    }
  })();

  // EdgeRuntime is provided by the Supabase Edge runtime.
  // @ts-expect-error - global injected at runtime
  EdgeRuntime.waitUntil(work);

  return new Response(JSON.stringify({ accepted: true, jobId }), {
    status: 202,
    headers: { "content-type": "application/json" },
  });
});
