// Server-only: do the translation here, in the Next process.
//
// The `translate` Edge Function exists for one reason — to run these model calls
// off Vercel's request clock, which kills a function mid-sentence. A self-hosted
// deployment has no such clock, so it should not need a Deno runtime, a shared
// secret and a separate deploy step to get a feature the app already has every
// ingredient for.
//
// Until this existed, it did need all three: `triggerPostTranslation` opened
// with `if (!isEdgeTranslateConfigured) return;` and translation simply never
// happened — no error, no log, no status. Measured on the author's own machine,
// the Edge runtime had been dead for five weeks and nobody noticed, because a
// silent `return` looks exactly like a feature nobody used.
//
// Same prompts as the Edge Function, from @/lib/ai/translate-prompts, with
// test/unit/translate-contract.test.ts holding the two to it.
import "server-only";
import { revalidatePath } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { deepseekChat, deepseekJson } from "@/lib/ai/deepseek";
import {
  bodySystemPrompt,
  detectLocale,
  otherLocale,
  pathsFor,
  shortSystemPrompt,
  tripSystemPrompt,
  type ShortPost,
} from "@/lib/ai/translate-prompts";

// Translation is transformation, not deliberation: there is nothing to weigh up,
// only a passage to carry across. Thinking on a body this size is how the
// proofreader spent an entire 8000-token budget reasoning and returned nothing
// (see CLAUDE.md), and it would fail here the same way and just as quietly.
const NO_THINKING = { model: "fast", noThinking: true, temperature: 0.3 } as const;

async function translateBody(
  body: string,
  source: "de" | "en",
  target: "de" | "en",
): Promise<string> {
  if (!body.trim()) return "";
  const out = await deepseekChat({
    ...NO_THINKING,
    maxTokens: 8000,
    messages: [
      { role: "system", content: bodySystemPrompt(source, target) },
      { role: "user", content: body },
    ],
    meta: { operation: "translate.body" },
  });
  return out.trim();
}

/**
 * Translate one post and everything attached to it, then rebuild the pages it
 * appears on. Returns the slug, or null when there was nothing to translate.
 *
 * Failures are written to `translation_error` rather than swallowed. A blank
 * translation with no explanation is the bug this whole module replaces.
 */
export async function runPostTranslation(postId: string): Promise<void> {
  const admin = getAdminSupabase();
  if (!admin) return;

  try {
    const { data: post } = await admin
      .from("posts")
      .select("title, excerpt, body, location, slug")
      .eq("id", postId)
      .maybeSingle();
    if (!post) return;

    const [{ data: photos }, { data: interactions }] = await Promise.all([
      admin.from("photos").select("id, caption").eq("post_id", postId).order("sort_order"),
      admin
        .from("interactions")
        .select("id, question, options, explanation")
        .eq("post_id", postId)
        .order("sort_order"),
    ]);

    const source = detectLocale(`${post.title} ${post.body ?? post.excerpt ?? ""}`);
    const target = otherLocale(source);

    const body = await translateBody(post.body ?? "", source, target);
    const short = await deepseekJson<ShortPost>({
      ...NO_THINKING,
      maxTokens: 4000,
      messages: [
        { role: "system", content: shortSystemPrompt(source, target) },
        {
          role: "user",
          content: JSON.stringify({
            title: post.title,
            excerpt: post.excerpt ?? null,
            location: post.location ?? null,
            interactions: (interactions ?? []).map((q) => ({
              id: q.id,
              question: q.question,
              options: q.options ?? [],
              explanation: q.explanation ?? null,
            })),
            photos: (photos ?? []).map((p) => ({
              id: p.id,
              caption: p.caption ?? null,
            })),
          }),
        },
      ],
      meta: { operation: "translate.short", postId },
    });

    await admin
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
      .eq("id", postId);

    for (const ph of short.photos ?? []) {
      await admin
        .from("photos")
        .update({ i18n: { [target]: { caption: ph.caption } } })
        .eq("id", ph.id);
    }
    for (const q of short.interactions ?? []) {
      await admin
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

    rebuild(pathsFor("post", post.slug ?? null));
  } catch (e) {
    await recordFailure(postId, "posts", e);
  }
}

/** Translate a trip's title and summary, then rebuild the pages listing it. */
export async function runTripTranslation(tripId: string): Promise<void> {
  const admin = getAdminSupabase();
  if (!admin) return;

  try {
    const { data: trip } = await admin
      .from("trips")
      .select("title, summary, slug")
      .eq("id", tripId)
      .maybeSingle();
    if (!trip) return;

    const source = detectLocale(`${trip.title} ${trip.summary ?? ""}`);
    const target = otherLocale(source);
    const t = await deepseekJson<{ title: string; summary: string | null }>({
      ...NO_THINKING,
      maxTokens: 800,
      messages: [
        { role: "system", content: tripSystemPrompt(source, target) },
        {
          role: "user",
          content: JSON.stringify({ title: trip.title, summary: trip.summary ?? null }),
        },
      ],
      meta: { operation: "translate.trip" },
    });

    await admin
      .from("trips")
      .update({
        source_locale: source,
        i18n: { [target]: { title: t.title, summary: t.summary } },
        translation_status: "ready",
        translation_error: null,
      })
      .eq("id", tripId);

    rebuild(pathsFor("trip", trip.slug ?? null));
  } catch (e) {
    await recordFailure(tripId, "trips", e);
  }
}

/**
 * Leave the reason where the author will see it — the editor reads
 * `translation_status`, and "error" with a message beats "pending" forever.
 */
async function recordFailure(
  id: string,
  table: "posts" | "trips",
  e: unknown,
): Promise<void> {
  const message = String((e as Error)?.message ?? e).slice(0, 500);
  console.error(`[translate] ${table} ${id} failed: ${message}`);
  try {
    const admin = getAdminSupabase();
    await admin
      ?.from(table)
      .update({ translation_status: "error", translation_error: message })
      .eq("id", id);
  } catch {
    /* the log above is the last resort */
  }
}

// The Edge Function has to ask the app to do this over HTTP, with a shared
// secret, through /api/revalidate. In-process it is a function call — and one
// that must not be able to undo a translation that already landed.
function rebuild(paths: string[]): void {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      /* the page waits for its next on-demand revalidation */
    }
  }
}
