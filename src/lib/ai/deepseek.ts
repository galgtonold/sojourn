// Server-only DeepSeek client (OpenAI-compatible Chat Completions API).
import "server-only";
import { env, isAiConfigured } from "@/lib/env";

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
}): Promise<string> {
  if (!isAiConfigured) throw new Error("AI is not configured");

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
    throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
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
