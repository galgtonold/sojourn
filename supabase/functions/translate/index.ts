// Background content translator. Next.js fires `{ type, id, siteUrl }` here on
// publish (post) or trip save; this runs the model calls off the request clock
// and writes the per-row `i18n` columns via the service role, then returns 202.
// When done it calls `siteUrl`/api/revalidate so the static pages rebuild with
// the finished translation (they were built in the source language at publish).
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

// One chat completion with a transient-retry policy. Rate limits (429) and
// request timeouts (408) are retried alongside 5xx — a rate-limit race when two
// posts publish together was silently failing the translation before.
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
  for (let attempt = 0; attempt < 4; attempt++) {
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
      retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
    } catch (e) {
      lastErr = e;
      if (!retryable || attempt === 3) break;
      // Exponential backoff with a little headroom for rate-limit windows.
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1) * (attempt + 1)));
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

// Language detection by stopword + umlaut frequency. Deterministic, free, and
// far more reliable for de/en prose than a terse model call — which, under a
// tiny token cap, sometimes prefaced its answer and got misparsed to the wrong
// language.
const DE_WORDS = new Set([
  "der", "die", "das", "und", "ist", "wir", "mit", "nicht", "auf", "ein",
  "eine", "den", "dem", "ich", "sich", "auch", "war", "sind", "im", "zum",
  "zur", "uber", "durch", "aber", "noch", "schon", "wie", "uns",
]);
const EN_WORDS = new Set([
  "the", "and", "we", "with", "is", "of", "to", "in", "that", "was",
  "our", "this", "for", "on", "it", "at", "as", "but", "from", "they",
  "were", "had", "have", "there",
]);

function countWords(haystack: string, words: Set<string>): number {
  let n = 0;
  for (const tok of haystack.split(/[^a-zäöüß]+/)) {
    if (words.has(tok)) n++;
  }
  return n;
}

function detectLocale(text: string): Locale {
  const t = text.toLowerCase();
  const de = countWords(t, DE_WORDS) + (t.match(/[äöüß]/g)?.length ?? 0);
  const en = countWords(t, EN_WORDS);
  return de >= en ? "de" : "en";
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
    { maxTokens: 8000, temperature: 0.3 },
  );
  return out.trim();
}

type ShortPost = {
  title: string;
  excerpt: string | null;
  location: string | null;
  interactions: {
    id: string;
    question: string;
    options: string[];
    explanation: string | null;
  }[];
  photos: { id: string; caption: string | null }[];
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
          "Translate: title, excerpt, location, every interaction's question/options/explanation, every photo's caption. " +
          "Keep null values null. Keep proper nouns. For 'location', keep specific town / island / landmark names as-is, " +
          "but render country and region names in the target language (e.g. Norway→Norwegen, Sweden→Schweden, Italy→Italien). " +
          "No commentary.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    { json: true, maxTokens: 4000, temperature: 0.3 },
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
    { json: true, maxTokens: 800, temperature: 0.3 },
  );
  return parseJsonLoose(out);
}

// Returns the post slug so the caller can revalidate `/posts/<slug>`.
// deno-lint-ignore no-explicit-any
async function translatePost(supabase: any, id: string): Promise<string | null> {
  const { data: post } = await supabase
    .from("posts")
    .select("title, excerpt, body, location, slug")
    .eq("id", id)
    .maybeSingle();
  if (!post) return null;
  const [{ data: photos }, { data: interactions }] = await Promise.all([
    supabase
      .from("photos")
      .select("id, caption")
      .eq("post_id", id)
      .order("sort_order"),
    supabase
      .from("interactions")
      .select("id, question, options, explanation")
      .eq("post_id", id)
      .order("sort_order"),
  ]);

  const source = detectLocale(
    `${post.title} ${post.body ?? post.excerpt ?? ""}`,
  );
  const target: Locale = source === "de" ? "en" : "de";

  const body = await translateBody(post.body ?? "", source, target);
  const short = await translatePostShort(
    {
      title: post.title,
      excerpt: post.excerpt ?? null,
      location: post.location ?? null,
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
      })),
    },
    source,
    target,
  );

  await supabase
    .from("posts")
    .update({
      source_locale: source,
      i18n: {
        [target]: {
          title: short.title,
          excerpt: short.excerpt,
          location: short.location,
          body,
        },
      },
      translation_status: "ready",
      translation_error: null,
    })
    .eq("id", id);

  for (const ph of short.photos ?? []) {
    await supabase
      .from("photos")
      .update({ i18n: { [target]: { caption: ph.caption } } })
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
  return post.slug ?? null;
}

// Returns the trip slug so the caller can revalidate `/trips/<slug>`.
// deno-lint-ignore no-explicit-any
async function translateTripEntity(supabase: any, id: string): Promise<string | null> {
  const { data: trip } = await supabase
    .from("trips")
    .select("title, summary, slug")
    .eq("id", id)
    .maybeSingle();
  if (!trip) return null;
  const source = detectLocale(`${trip.title} ${trip.summary ?? ""}`);
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
      translation_error: null,
    })
    .eq("id", id);
  return trip.slug ?? null;
}

// Rebuild the public static pages affected by a freshly-translated entity. The
// Next app authenticates this with the same shared secret it sent us; best-effort
// (a failure just means the page waits for its next on-demand revalidation).
async function revalidate(siteUrl: string, paths: string[]): Promise<void> {
  const secret = Deno.env.get("EDGE_SHARED_SECRET");
  if (!siteUrl || !secret) return;
  try {
    await fetch(`${siteUrl}/api/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-edge-secret": secret },
      body: JSON.stringify({ paths }),
    });
  } catch (e) {
    console.error("revalidate callback failed", String(e));
  }
}

function pathsFor(entity: string, slug: string | null): string[] {
  if (entity === "post") {
    return [
      "/",
      "/posts",
      "/photos",
      "/map",
      "/trips",
      ...(slug ? [`/posts/${slug}`] : []),
    ];
  }
  return [
    "/",
    "/trips",
    "/posts",
    "/photos",
    "/map",
    ...(slug ? [`/trips/${slug}`, `/trips/${slug}/map`] : []),
  ];
}

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get("EDGE_SHARED_SECRET");
  if (!secret || req.headers.get("x-edge-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }

  let type: string | undefined;
  let id: string | undefined;
  let siteUrl: string | undefined;
  try {
    ({ type, id, siteUrl } = await req.json());
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
  const origin = siteUrl;

  const work = (async () => {
    try {
      const slug =
        entity === "post"
          ? await translatePost(supabase, entityId)
          : await translateTripEntity(supabase, entityId);
      // Now that the i18n columns are written, rebuild the affected pages.
      if (origin) await revalidate(origin, pathsFor(entity, slug));
    } catch (e) {
      const table = entity === "post" ? "posts" : "trips";
      await supabase
        .from(table)
        .update({
          translation_status: "error",
          translation_error: String(e).slice(0, 500),
        })
        .eq("id", entityId);
      console.error("translate failed", entity, entityId, String(e));
    }
  })();

  // @ts-expect-error - EdgeRuntime is injected by the Supabase Edge runtime.
  EdgeRuntime.waitUntil(work);
  return json({ accepted: true, type: entity, id: entityId }, 202);
});
