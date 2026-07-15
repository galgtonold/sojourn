// Shared DeepSeek chat client for the edge functions (translate, llm-call), so
// both go through ONE retry policy instead of each keeping its own copy.
//
// Transient failures are retried with exponential backoff: 5xx, 429 (rate
// limit) and 408 (request timeout) — a rate-limit race when several calls fire
// at once (a burst of section generations, or two posts publishing together)
// used to throw immediately and fail silently. Other 4xx are deterministic and
// surface at once.
//
// The provider config (key, base URL, fast model) comes from ./config.ts —
// app_secrets over the function's own env — so a key set in /admin/settings
// reaches these functions too, not just the app.
import { getEdgeAiConfig } from "./config.ts";

export type ChatOptions = {
  messages: unknown;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

const RETRYABLE_STATUS = (s: number) => s >= 500 || s === 429 || s === 408;
const MAX_ATTEMPTS = 4;

export async function chatCompletion(opts: ChatOptions): Promise<string> {
  // Resolved once per call, outside the retry loop below: a retry must not
  // re-read config mid-flight and swap credentials between attempts.
  const cfg = await getEdgeAiConfig();
  const payload = JSON.stringify({
    model: opts.model ?? cfg.fastModel,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let retryable = true;
    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: payload,
      });
      if (res.ok) {
        const data = await res.json();
        return data?.choices?.[0]?.message?.content ?? "";
      }
      retryable = RETRYABLE_STATUS(res.status);
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
      if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
      // Exponential backoff with headroom for rate-limit windows.
      await new Promise((r) =>
        setTimeout(r, 1000 * (attempt + 1) * (attempt + 1)),
      );
    }
  }
  throw lastErr ?? new Error("LLM call failed");
}
