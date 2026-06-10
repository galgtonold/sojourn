import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import {
  materializeInteractions,
  pruneUnreferencedInteractions,
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
  body: z.string().min(1),
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
  // then drop interactions this body no longer references (e.g. a quiz a
  // previous draft created that a regenerate has replaced).
  const { body } = await materializeInteractions(supabase, p.postId, p.body);
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

  // Return the persisted fields so the editor can re-seed itself immediately
  // (the body here is the materialised version and the cover is fully resolved,
  // so this is the authoritative draft — no refetch race).
  const { data: saved, error } = await supabase
    .from("posts")
    .update(update)
    .eq("id", p.postId)
    .select("title, excerpt, body, location, lat, lng, cover_image")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return { ok: true, post: saved };
}
