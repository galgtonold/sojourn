// Server-only DeepSeek client (OpenAI-compatible Chat Completions API).
import "server-only";
import { env, isAiConfigured } from "@/lib/env";
import { recordUsage } from "@/lib/ai/usage";

export type UsageMeta = {
  operation: string;
  postId?: string | null;
  userId?: string | null;
};

export const aiModels = {
  fast: env.deepseekModelFast,
  reasoner: env.deepseekModelReasoner,
  vision: env.deepseekModelVision,
};

// OpenAI-style multimodal content parts.
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

export async function deepseekChat(opts: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  meta?: UsageMeta;
}): Promise<string> {
  if (!isAiConfigured) throw new Error("AI is not configured");

  // JSON-mode responses occasionally come back truncated / not valid JSON.
  // Rather than fail the whole generation on a transient blip, retry a couple
  // of times and only surface the last (still-unparseable) output.
  const attempts = opts.json ? 3 : 1;
  let last = "";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(`${env.deepseekBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // Retry transient upstream errors; surface client errors immediately.
      if (attempt < attempts && res.status >= 500) continue;
      throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();

    if (opts.meta) {
      const u = data?.usage ?? {};
      const prompt = u.prompt_tokens ?? 0;
      const hit = u.prompt_cache_hit_tokens ?? 0;
      // Await (don't fire-and-forget): on fast-returning serverless routes the
      // lambda can freeze right after the handler returns, dropping a pending
      // background insert — which is why short calls like the outline went
      // untracked while longer ones (sections) recorded.
      await recordUsage({
        operation: opts.meta.operation,
        model: opts.model,
        postId: opts.meta.postId,
        userId: opts.meta.userId,
        usage: {
          prompt_tokens: prompt,
          completion_tokens: u.completion_tokens ?? 0,
          cache_hit_tokens: hit,
          cache_miss_tokens:
            u.prompt_cache_miss_tokens ?? Math.max(0, prompt - hit),
        },
      });
    }

    last = data?.choices?.[0]?.message?.content ?? "";
    if (!opts.json || isParseableJson(last)) return last;
    // Otherwise loop and try again for a clean JSON object.
  }

  return last;
}

function isParseableJson(raw: string): boolean {
  try {
    parseJsonLoose(raw);
    return true;
  } catch {
    return false;
  }
}

/** Parse JSON that may be wrapped in prose or ```json fences. */
export function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first !== -1 && last > first) {
      return JSON.parse(cleaned.slice(first, last + 1)) as T;
    }
    throw new Error("Could not parse model JSON output");
  }
}
