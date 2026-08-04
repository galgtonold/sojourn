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
// No "vision" alias: DeepSeek's API takes no image input. Photo descriptions go
// through the separate vision provider (@/lib/ai/enrich, visionApiKey/…).
export type ModelAlias = "fast" | "reasoner";

/** Alias → the configured model ID. Exported for the `ai_jobs` enqueue path,
 *  which must persist a real ID: the Edge Function worker sends the stored
 *  `model` straight to the provider and can't resolve an alias itself. */
export function resolveModel(cfg: AiConfig, alias: ModelAlias): string {
  return alias === "reasoner" ? cfg.deepseekModelReasoner : cfg.deepseekModelFast;
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
  /**
   * Turn the model's chain-of-thought off for this call.
   *
   * `reasoning_content` is billed inside `completion_tokens` and arrives BEFORE
   * the first byte of the answer, so a model that will not stop thinking never
   * produces one. Measured on the proofreader against a real 4,600-character
   * article: 8000-token cap → 8000 reasoning tokens, 0 content; 32000 → 32000
   * reasoning tokens, 0 content, with the thinking visibly repeating itself.
   * With thinking off the same article answered in 5.7s and found MORE real
   * errors than the reasoning run did.
   *
   * Use it for tasks that are recognition rather than deliberation. Leave it on
   * for drafting.
   */
  noThinking?: boolean;
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
  const startedAt = Date.now();
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
      ...(opts.noThinking ? { thinking: { type: "disabled" } } : {}),
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
  const durationMs = Date.now() - startedAt;

  if (opts.meta) {
    const u = data?.usage ?? {};
    const prompt = u.prompt_tokens ?? 0;
    const hit = u.prompt_cache_hit_tokens ?? 0;
    // Thinking is billed inside completion_tokens and never appears in the
    // output, so without this a truncated call is indistinguishable from one
    // that genuinely wrote too much. Two opposite bugs, one row.
    const reasoning: number | undefined =
      typeof u.completion_tokens_details?.reasoning_tokens === "number"
        ? u.completion_tokens_details.reasoning_tokens
        : undefined;
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
        reasoning_tokens: reasoning,
      },
      durationMs,
      // Recorded only when the call was cut off (or AI_DEBUG is on). Usually
      // empty, and empty is the answer: nothing was written before the budget
      // ran out.
      responsePreview: data?.choices?.[0]?.message?.content ?? "",
      // What it was thinking about, not just how much. This is the difference
      // between "spent 8000 tokens reasoning" and "spent them re-checking
      // sentences it had already cleared".
      reasoningPreview: data?.choices?.[0]?.message?.reasoning_content ?? "",
      // What was actually SENT. A prompt that has drifted from the code it
      // belongs to is invisible in every counter and obvious here.
      requestPreview: describeRequest(messages),
    });
  }

  return { content: data?.choices?.[0]?.message?.content ?? "", finishReason };
}

/** A compact, bounded rendering of the messages, for the usage record. */
function describeRequest(messages: ChatMessage[]): string {
  return messages
    .map((m) => {
      const text =
        typeof m.content === "string"
          ? m.content
          : m.content
              .map((part) => (part.type === "text" ? part.text : "[image]"))
              .join(" ");
      return `${m.role}: ${text}`;
    })
    .join("\n---\n");
}

export type Completion = { content: string; finishReason: string | null };

const REPAIR_SYSTEM =
  "You repair malformed JSON. Output ONLY one valid, complete, minified JSON " +
  "object — no prose, no markdown, no code fences.";

/**
 * The JSON retry + repair decision loop — transport-injected so the
 * retry-vs-repair-vs-give-up decisions (and *which* failure to record) are
 * testable without a network.
 *
 * A RETRY IS ONLY EVER FOR A TRANSIENT SERVER ERROR. A 5xx with attempts
 * remaining is retried; a client error is recorded via `onFail` and rethrown;
 * anything that came back but did not parse goes straight to the repair pass.
 *
 * There used to be a third case: a `length` finish doubled the cap and tried
 * again, up to a 32000 ceiling. The intent was sound — that output was cut off,
 * not unlucky — but in practice it turned one failure into three, each slower
 * than the last and all ending identically, while the author waited. The
 * proofreader made the cost plain: 8000 tokens of reasoning, then 16000, then
 * nothing to show for either. Callers now choose a cap that fits the work up
 * front, and a truncated call is reported rather than re-bought.
 *
 * Failing everything, it runs ONE targeted repair pass (temperature 0, a repair
 * prompt), then records the reason (`length` → truncated at the cap; otherwise
 * malformed) and returns the raw text for the caller's parse to throw on. A
 * cap-truncated round often returns EMPTY content — reasoning is billed first
 * and arrives first — which leaves repair nothing to work on, so it is skipped.
 * `complete`'s `overrides.repair` marks the repair round for separate metering.
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
  // Fixed for the life of the call. It used to double on every `length` finish,
  // up to a 32000 ceiling — which turned one failure into three, each slower than
  // the last, all ending the same way. Callers now pick a cap generous enough
  // for the work up front.
  const cap = maxTokens;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const r = await complete(messages, { maxTokens: cap });
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
    // Neither truncation nor malformed JSON is worth another roll of the same
    // dice: temperature is already 0 for these calls, so a re-run reproduces
    // the same output at full price. Only a transient server error earns a
    // retry, and that is handled in the catch above. Go straight to repair.
    break;
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
        { temperature: 0, maxTokens: Math.max(cap, 2048), repair: true },
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
  // parse throws, which the UI turns into a friendly message. Name the cap it
  // gave up at, not the caller's starting one: after escalation those differ,
  // and the one that still wasn't enough is the diagnostic.
  await onFail({
    finishReason: lastFinish,
    error:
      lastFinish === "length"
        ? `output truncated at the ${cap}-token cap`
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
