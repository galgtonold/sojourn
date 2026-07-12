import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import {
  materializeInteractions,
  pruneUnreferencedInteractions,
  stripIncompleteDirectives,
} from "@/lib/ai/materialize";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  title: z.string().min(1),
  excerpt: z.string().optional(),
  location: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  cover_photo_id: z.string().uuid().nullable().optional(),
  date: z.string().optional(),
  body: z.string().min(1),
  // Snapshot inputs (best-effort): the outline plan and whether the homogenize
  // pass fell back to the raw concatenation — persisted to post_ai_drafts so
  // draft-vs-final is a plain diff and the fallback rate is measurable.
  outline: z.any().optional(),
  homogenizeFellBack: z.boolean().optional().default(false),
});

// Persists the assembled draft (the client builds the body from the sections).
export const POST = adminRoute(schema, saveDraft);

async function saveDraft({ supabase, input }: AdminCtx<z.infer<typeof schema>>) {
  const p = input;

  // Resolve the cover photo's URL / fallbacks.
  let cover: { url: string | null; lat: number | null; lng: number | null; place_name: string | null } | null = null;
  if (p.cover_photo_id) {
    const { data } = await supabase
      .from("photos")
      .select("url, lat, lng, place_name")
      .eq("id", p.cover_photo_id)
      .maybeSingle();
    cover = data ?? null;
  }

  // Materialise any inline :::poll / :::quiz blocks into real interactions,
  // drop a half-written block the generator may have truncated (so it never
  // shows as raw ":::poll" text), then prune interactions this body no longer
  // references (e.g. a quiz a previous draft created that a regenerate replaced).
  const materialized = await materializeInteractions(supabase, p.postId, p.body);
  let body = stripIncompleteDirectives(materialized.body);

  // Safety net: every author-defined interaction MUST survive a regenerate. If
  // the model failed to place one inline, append its [ask:id] so it's preserved
  // (and not pruned) — the author's poll/quiz is never silently dropped.
  const { data: authored } = await supabase
    .from("interactions")
    .select("id")
    .eq("post_id", p.postId)
    .eq("source", "author")
    .order("sort_order", { ascending: true });
  const missing = (authored ?? [])
    .map((r) => r.id as string)
    .filter((id) => !body.includes(`[ask:${id}]`));
  if (missing.length) {
    body = `${body.trimEnd()}\n\n${missing
      .map((id) => `[ask:${id}]`)
      .join("\n\n")}`;
  }

  await pruneUnreferencedInteractions(supabase, p.postId, body);

  const update: Record<string, unknown> = {
    title: p.title.trim(),
    excerpt: p.excerpt?.trim() || null,
    body,
    location: p.location?.trim() || cover?.place_name || null,
    lat: p.lat ?? cover?.lat ?? null,
    lng: p.lng ?? cover?.lng ?? null,
  };
  if (cover?.url) update.cover_image = cover.url;

  // Default the entry date from the GPX/photo day — but only when the author
  // hasn't already set one, so a deliberate date is never overwritten.
  if (p.date) {
    const { data: existing } = await supabase
      .from("posts")
      .select("published_at")
      .eq("id", p.postId)
      .maybeSingle();
    if (!existing?.published_at) {
      update.published_at = new Date(`${p.date}T12:00:00.000Z`).toISOString();
    }
  }

  // Return the persisted fields so the editor can re-seed itself immediately
  // (the body here is the materialised version and the cover is fully resolved,
  // so this is the authoritative draft — no refetch race).
  const { data: saved, error } = await supabase
    .from("posts")
    .update(update)
    .eq("id", p.postId)
    .select("title, excerpt, body, location, lat, lng, cover_image, published_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Snapshot the pristine machine draft so draft-vs-final is a plain diff (no
  // ai_jobs archaeology) and the homogenize-fallback rate is measurable. Its own
  // fail-closed table (never anon-readable). Best-effort — a snapshot failure
  // must never fail the draft save (the post is the primary artifact).
  try {
    await supabase.from("post_ai_drafts").upsert(
      {
        post_id: p.postId,
        draft_body: body,
        outline: p.outline ?? null,
        homogenize_fell_back: p.homogenizeFellBack ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "post_id" },
    );
  } catch {
    /* snapshot is secondary — never fail the draft save on it */
  }

  // Return the post's current interactions too, so the editor re-seeds its list
  // and the freshly-materialised [ask:id] tags resolve immediately (no stale
  // "invalid reference" until a manual reload).
  const { data: interactions } = await supabase
    .from("interactions")
    .select("id, kind, question, options, correct_index, explanation")
    .eq("post_id", p.postId)
    .order("sort_order", { ascending: true });

  return { ok: true, post: saved, interactions: interactions ?? [] };
}
