// Background content translator. Next.js fires `{ type, id }` here on publish
// (post) or trip save; this runs the model calls off the request clock and
// writes the per-row `i18n` columns via the service role, then returns 202.
//
// Strategy per post: detect the source language, translate the body as plain
// Markdown (so [photo:]/[ask:] tokens and structure survive without JSON
// escaping), then translate the short fields (title/excerpt + each interaction
// and photo) in one JSON call. `i18n` holds only the non-source locale.
//
// Auth: shared secret (x-edge-secret) → deploy with verify_jwt = false.
// Secrets: EDGE_SHARED_SECRET, DEEPSEEK_API_KEY, (optional DEEPSEEK_BASE_URL,
// DEEPSEEK_MODEL_FAST). SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected.
import { createClient } from "jsr:@supabase/supabase-js@2";

type Locale = "de" | "en";
const LANG: Record<Locale, string> = { de: "German", en: "English" };

const apiBase = () =>
  Deno.env.get("DEEPSEEK_BASE_URL") ?? "https://api.deepseek.com";
const fastModel = () =>
  Deno.env.get("DEEPSEEK_MODEL_FAST") ?? "deepseek-v4-flash";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// One chat completion with the same transient-retry policy as llm-call.
async function chat(
  messages: unknown,
  opts: { json?: boolean; maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const payload = JSON.stringify({
    model: fastModel(),
    messages,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4096,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
  });
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryable = true;
    try {
      const res = await fetch(`${apiBase()}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${Deno.env.get("DEEPSEEK_API_KEY")}`,
        },
        body: payload,
      });
      if (res.ok) {
        const data = await res.json();
        return data?.choices?.[0]?.message?.content ?? "";
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
  throw lastErr ?? new Error("LLM call failed");
}

function parseJsonLoose<T>(raw: string): T {
  const cleaned = raw.replace(/```json\s*|\s*```/g, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const a = cleaned.indexOf("{");
    const b = cleaned.lastIndexOf("}");
    if (a !== -1 && b > a) return JSON.parse(cleaned.slice(a, b + 1)) as T;
    throw new Error("could not parse model JSON");
  }
}

async function detectLocale(text: string): Promise<Locale> {
  const out = await chat(
    [
      {
        role: "system",
        content:
          "Identify the language of the text. Reply with exactly one word: 'de' for German or 'en' for English.",
      },
      { role: "user", content: text.slice(0, 600) },
    ],
    { maxTokens: 4, temperature: 0 },
  );
  const t = out.trim().toLowerCase();
  return t.startsWith("de") || t.includes("german") || t.includes("deutsch")
    ? "de"
    : "en";
}

async function translateBody(
  body: string,
  source: Locale,
  target: Locale,
): Promise<string> {
  if (!body.trim()) return "";
  const out = await chat(
    [
      {
        role: "system",
        content:
          `You are a literary translator for a personal travel journal. Translate the Markdown from ${LANG[source]} to ${LANG[target]}. ` +
          "Output ONLY the translated Markdown — no preamble, no code fences. " +
          "Preserve EXACTLY and in place every token of the form [photo:...] and [ask:...]. " +
          "Preserve all Markdown structure (headings, lists, blockquotes, links, emphasis) and the line breaks. " +
          "Do not add or remove content. Keep proper nouns and place names. Keep the warm first-person voice.",
      },
      { role: "user", content: body },
    ],
    { maxTokens: 4096, temperature: 0.3 },
  );
  return out.trim();
}

type ShortPost = {
  title: string;
  excerpt: string | null;
  interactions: {
    id: string;
    question: string;
    options: string[];
    explanation: string | null;
  }[];
  photos: { id: string; caption: string | null; alt: string | null }[];
};

async function translatePostShort(
  input: ShortPost,
  source: Locale,
  target: Locale,
): Promise<ShortPost> {
  const out = await chat(
    [
      {
        role: "system",
        content:
          `Translate the human-readable string values in this JSON from ${LANG[source]} to ${LANG[target]}. ` +
          "Return ONLY a JSON object with the SAME shape, the same ids, and the same array lengths and order. " +
          "Translate: title, excerpt, every interaction's question/options/explanation, every photo's caption/alt. " +
          "Keep null values null. Keep proper nouns and place names. No commentary.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    { json: true, maxTokens: 2000, temperature: 0.3 },
  );
  return parseJsonLoose<ShortPost>(out);
}

async function translateTrip(
  input: { title: string; summary: string | null },
  source: Locale,
  target: Locale,
): Promise<{ title: string; summary: string | null }> {
  const out = await chat(
    [
      {
        role: "system",
        content:
          `Translate the string values in this JSON from ${LANG[source]} to ${LANG[target]}. ` +
          'Return ONLY a JSON object {"title":string,"summary":string|null}. Keep null null, keep proper nouns, no commentary.',
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    { json: true, maxTokens: 600, temperature: 0.3 },
  );
  return parseJsonLoose(out);
}

// deno-lint-ignore no-explicit-any
async function translatePost(supabase: any, id: string): Promise<void> {
  const { data: post } = await supabase
    .from("posts")
    .select("title, excerpt, body")
    .eq("id", id)
    .maybeSingle();
  if (!post) return;
  const [{ data: photos }, { data: interactions }] = await Promise.all([
    supabase
      .from("photos")
      .select("id, caption, alt")
      .eq("post_id", id)
      .order("sort_order"),
    supabase
      .from("interactions")
      .select("id, question, options, explanation")
      .eq("post_id", id)
      .order("sort_order"),
  ]);

  const source = await detectLocale(
    `${post.title}\n\n${post.body ?? post.excerpt ?? ""}`,
  );
  const target: Locale = source === "de" ? "en" : "de";

  const body = await translateBody(post.body ?? "", source, target);
  const short = await translatePostShort(
    {
      title: post.title,
      excerpt: post.excerpt ?? null,
      // deno-lint-ignore no-explicit-any
      interactions: (interactions ?? []).map((q: any) => ({
        id: q.id,
        question: q.question,
        options: q.options ?? [],
        explanation: q.explanation ?? null,
      })),
      // deno-lint-ignore no-explicit-any
      photos: (photos ?? []).map((p: any) => ({
        id: p.id,
        caption: p.caption ?? null,
        alt: p.alt ?? null,
      })),
    },
    source,
    target,
  );

  await supabase
    .from("posts")
    .update({
      source_locale: source,
      i18n: { [target]: { title: short.title, excerpt: short.excerpt, body } },
      translation_status: "ready",
    })
    .eq("id", id);

  for (const ph of short.photos ?? []) {
    await supabase
      .from("photos")
      .update({ i18n: { [target]: { caption: ph.caption, alt: ph.alt } } })
      .eq("id", ph.id);
  }
  for (const q of short.interactions ?? []) {
    await supabase
      .from("interactions")
      .update({
        i18n: {
          [target]: {
            question: q.question,
            options: q.options,
            explanation: q.explanation,
          },
        },
      })
      .eq("id", q.id);
  }
}

// deno-lint-ignore no-explicit-any
async function translateTripEntity(supabase: any, id: string): Promise<void> {
  const { data: trip } = await supabase
    .from("trips")
    .select("title, summary")
    .eq("id", id)
    .maybeSingle();
  if (!trip) return;
  const source = await detectLocale(`${trip.title}\n\n${trip.summary ?? ""}`);
  const target: Locale = source === "de" ? "en" : "de";
  const t = await translateTrip(
    { title: trip.title, summary: trip.summary ?? null },
    source,
    target,
  );
  await supabase
    .from("trips")
    .update({
      source_locale: source,
      i18n: { [target]: { title: t.title, summary: t.summary } },
      translation_status: "ready",
    })
    .eq("id", id);
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("EDGE_SHARED_SECRET");
  if (!secret || req.headers.get("x-edge-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let type: string | undefined;
  let id: string | undefined;
  try {
    ({ type, id } = await req.json());
  } catch {
    /* no body */
  }
  if (!id || (type !== "post" && type !== "trip")) {
    return json({ error: "type ('post'|'trip') and id required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const entity = type;
  const entityId = id;

  const work = (async () => {
    try {
      if (entity === "post") await translatePost(supabase, entityId);
      else await translateTripEntity(supabase, entityId);
    } catch (e) {
      const table = entity === "post" ? "posts" : "trips";
      await supabase
        .from(table)
        .update({ translation_status: "error" })
        .eq("id", entityId);
      console.error("translate failed", entity, entityId, String(e));
    }
  })();

  // @ts-expect-error - EdgeRuntime is injected by the Supabase Edge runtime.
  EdgeRuntime.waitUntil(work);
  return json({ accepted: true, type: entity, id: entityId }, 202);
});
