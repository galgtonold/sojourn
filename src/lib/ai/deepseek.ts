// Server-only DeepSeek client (OpenAI-compatible Chat Completions API).
import "server-only";
import { getAiConfig, type AiConfig } from "@/lib/ai-config";
import { recordUsage, recordAiFailure } from "@/lib/ai/usage";

export type UsageMeta = {
  operation: string;
  postId?: string | null;
  userId?: string | null;
};

// Callers name a ROLE, not a model ID. The ID is configurable at runtime (env or
// /admin/settings), so resolving it here — where we're already async — keeps
// every call site synchronous and stops routes from knowing model names.
export type ModelAlias = "fast" | "reasoner" | "vision";

/** Alias → the configured model ID. Exported for the `ai_jobs` enqueue path,
 *  which must persist a real ID: the Edge Function worker sends the stored
 *  `model` straight to the provider and can't resolve an alias itself. */
export function resolveModel(cfg: AiConfig, alias: ModelAlias): string {
  return alias === "reasoner"
    ? cfg.deepseekModelReasoner
    : alias === "vision"
      ? cfg.deepseekModelVision
      : cfg.deepseekModelFast;
}

// OpenAI-style multimodal content parts.
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

type ChatOpts = {
  model: ModelAlias;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  meta?: UsageMeta;
};

// One round-trip to the model. Returns the text plus `finishReason` ("stop" |
// "length" | …) so the caller can tell a truncated response from a complete
// one. Throws on HTTP error with the status attached so the caller can decide
// whether the failure is worth retrying.
async function singleCompletion(
  opts: ChatOpts,
  messages: ChatMessage[],
  cfg: AiConfig,
  model: string,
): Promise<{ content: string; finishReason: string | null }> {
  const res = await fetch(`${cfg.deepseekBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cfg.deepseekApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(
      `DeepSeek ${res.status}: ${detail.slice(0, 300)}`,
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const finishReason = data?.choices?.[0]?.finish_reason ?? null;

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
      model,
      postId: opts.meta.postId,
      userId: opts.meta.userId,
      finishReason,
      usage: {
        prompt_tokens: prompt,
        completion_tokens: u.completion_tokens ?? 0,
        cache_hit_tokens: hit,
        cache_miss_tokens:
          u.prompt_cache_miss_tokens ?? Math.max(0, prompt - hit),
      },
    });
  }

  return { content: data?.choices?.[0]?.message?.content ?? "", finishReason };
}

export type Completion = { content: string; finishReason: string | null };

const REPAIR_SYSTEM =
  "You repair malformed JSON. Output ONLY one valid, complete, minified JSON " +
  "object — no prose, no markdown, no code fences.";

/**
 * The JSON retry + repair decision loop — transport-injected so the retry-vs-
 * repair-vs-give-up decisions (and *which* failure to record) are testable
 * without a network. Runs up to `attempts` completions, retrying ONLY a 5xx with
 * attempts remaining (a client error is recorded via `onFail` then rethrown);
 * returns as soon as an output parses. If none do, it runs ONE targeted repair
 * pass (temperature 0, a repair prompt) and, failing that, records the reason
 * (`length` → truncated at the cap; otherwise malformed) and returns the raw
 * text for the caller's parse to throw on. `complete`'s `overrides.repair` marks
 * the repair round so the caller can meter it separately.
 */
export async function runJsonWithRepair(opts: {
  messages: ChatMessage[];
  attempts: number;
  maxTokens: number;
  isParseable: (raw: string) => boolean;
  complete: (
    messages: ChatMessage[],
    overrides: { temperature?: number; maxTokens?: number; repair?: boolean },
  ) => Promise<Completion>;
  onFail: (f: { error: string; finishReason?: string | null }) => Promise<void>;
}): Promise<string> {
  const { messages, attempts, maxTokens, isParseable, complete, onFail } = opts;
  let last = "";
  let lastFinish: string | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await complete(messages, {});
      last = r.content;
      lastFinish = r.finishReason;
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      // Retry transient upstream errors; surface client errors immediately.
      if (attempt < attempts && status >= 500) continue;
      // About to give up on this call — persist why (a thrown error records no
      // usage row, so this is the only trace).
      await onFail({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    if (isParseable(last)) return last;
    // Otherwise loop and try again for a clean JSON object.
  }

  // Still not valid JSON after the retries. Run one targeted repair pass: hand
  // the broken text back and ask only for corrected JSON. With fresh tokens at
  // temperature 0 this reliably fixes the common failures (code fences, trailing
  // prose, a truncated tail) that a blind reroll tends to reproduce.
  if (last.trim()) {
    try {
      const repaired = await complete(
        [
          { role: "system", content: REPAIR_SYSTEM },
          {
            role: "user",
            content:
              "Repair this into a single valid JSON object, preserving all " +
              "data and completing any truncated structure:\n\n" +
              last,
          },
        ],
        { temperature: 0, maxTokens: Math.max(maxTokens, 2048), repair: true },
      );
      if (isParseable(repaired.content)) return repaired.content;
      last = repaired.content;
      lastFinish = repaired.finishReason;
    } catch {
      /* fall through and return the last raw output */
    }
  }

  // Give up: the JSON never parsed. Record why (truncated at the cap vs.
  // malformed) so it's diagnosable, then return the raw text — the caller's
  // parse throws, which the UI turns into a friendly message.
  await onFail({
    finishReason: lastFinish,
    error:
      lastFinish === "length"
        ? `output truncated at the ${maxTokens}-token cap`
        : "unparseable model JSON after retries + repair",
  });
  return last;
}

export async function deepseekChat(opts: ChatOpts): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.isAiConfigured) throw new Error("AI is not configured");
  const model = resolveModel(cfg, opts.model);
  const json = Boolean(opts.json);

  // Injected transport: one round trip, applying the repair overrides and a
  // ":repair" operation suffix so the repair round is metered separately.
  const complete = (
    messages: ChatMessage[],
    overrides: { temperature?: number; maxTokens?: number; repair?: boolean },
  ): Promise<Completion> =>
    singleCompletion(
      {
        ...opts,
        temperature: overrides.temperature ?? opts.temperature,
        maxTokens: overrides.maxTokens ?? opts.maxTokens,
        meta:
          opts.meta && overrides.repair
            ? { ...opts.meta, operation: `${opts.meta.operation}:repair` }
            : opts.meta,
      },
      messages,
      cfg,
      model,
    );

  const onFail = async (f: { error: string; finishReason?: string | null }) => {
    if (!opts.meta) return;
    await recordAiFailure({
      operation: opts.meta.operation,
      model,
      postId: opts.meta.postId,
      userId: opts.meta.userId,
      finishReason: f.finishReason,
      error: f.error,
    });
  };

  // JSON-mode responses occasionally come back truncated / not valid JSON, so
  // they get the retry + repair loop; a plain-text call is a single round trip.
  if (!json) {
    try {
      return (await complete(opts.messages, {})).content;
    } catch (e) {
      await onFail({ error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  return runJsonWithRepair({
    messages: opts.messages,
    attempts: 3,
    maxTokens: opts.maxTokens ?? 4096,
    isParseable: isParseableJson,
    complete,
    onFail,
  });
}

// A JSON-mode call whose parsed object you want. Sets JSON mode, runs the same
// retry + repair as deepseekChat, then parses (throwing on a genuinely
// unparseable response — callers that want a fallback catch it). Concentrates
// the `deepseekChat({ json: true }) + parseJsonLoose` pattern the AI routes
// repeated.
export async function deepseekJson<T>(
  opts: Omit<ChatOpts, "json">,
): Promise<T> {
  const raw = await deepseekChat({ ...opts, json: true });
  return parseJsonLoose<T>(raw);
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
