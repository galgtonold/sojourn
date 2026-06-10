// Thin async LLM wrapper. The Next.js side enqueues an `ai_jobs` row and POSTs
// `{ jobId }` here; this function runs the (slow) model call in the background
// via EdgeRuntime.waitUntil — which has a far longer wall-clock budget than a
// Vercel function — and writes the result back to the row. Returns 202 at once.
//
// Auth is a shared secret (x-edge-secret), so deploy with verify_jwt = false.
// Secrets needed: EDGE_SHARED_SECRET, DEEPSEEK_API_KEY, (optional DEEPSEEK_BASE_URL).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
import { createClient } from "jsr:@supabase/supabase-js@2";

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
      const base =
        Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
      const payload = JSON.stringify({
        model: job.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.7,
        max_tokens: input.maxTokens ?? 4096,
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      });

      // Retry transient upstream failures (network drops, 5xx) the same way the
      // Node client does — a single blip shouldn't lose the whole section. 4xx
      // is deterministic, so surface it immediately.
      let output = "";
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        let retryable = true;
        try {
          const res = await fetch(`${base}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${Deno.env.get("DEEPSEEK_API_KEY")}`,
            },
            body: payload,
          });
          if (res.ok) {
            const data = await res.json();
            output = data?.choices?.[0]?.message?.content ?? "";
            lastErr = null;
            break;
          }
          retryable = res.status >= 500;
          const detail = await res.text().catch(() => "");
          throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
        } catch (e) {
          lastErr = e;
          if (!retryable || attempt === 2) break;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
      if (lastErr) throw lastErr;

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
