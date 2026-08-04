import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { notifyViewers } from "@/lib/notify";
import { afterResponse } from "@/lib/after-response";
import { env } from "@/lib/env";
import { randomUUID } from "node:crypto";
import { slugify } from "@/lib/utils";
import { materializeInteractions } from "@/lib/ai/materialize";
import { triggerPostTranslation } from "@/lib/ai/translate";

// Translation runs in-process when no Edge Function is configured (see
// @/lib/ai/translate), scheduled with `after()` — so the model calls are billed
// against THIS function's clock even though the response has already gone. The
// body pass is capped at 8000 tokens, which does not fit in Vercel's default 60s
// and a killed function records nothing at all. Raising a cap and raising the
// route's clock are one decision (CLAUDE.md).
export const maxDuration = 180;


const schema = z.object({
  title: z.string().trim().optional(),
  slug: z.string().trim().optional(),
  location: z.string().optional(),
  excerpt: z.string().optional(),
  body: z.string().optional(),
  cover_image: z.string().optional(),
  cover_alt: z.string().optional(),
  trip_id: z.string().uuid().nullable().optional(),
  date: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  published: z.boolean().optional(),
});

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const p = parsed.data;

  // Posts are trip-scoped by RLS: an insert needs is_owner() OR
  // can_edit_trip(trip_id). The instant-draft create sends no trip, so a
  // collaborator (member) would hit a NULL trip_id and be rejected. Resolve a
  // trip they're actually granted — default to their first editable one
  // (changeable in the editor). A member with no granted trip can't create yet.
  const viewer = await getViewer();
  let tripId = p.trip_id ?? null;
  if (!viewer.isOwner) {
    if (tripId && !viewer.tripIds.includes(tripId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    tripId = tripId ?? viewer.tripIds[0] ?? null;
    if (!tripId) {
      return NextResponse.json({ error: "no-editable-trip" }, { status: 403 });
    }
  }

  // Allow a titleless draft (the "instant draft" create flow): fall back to a
  // unique placeholder slug so the not-null/unique constraint holds. The editor
  // re-derives the slug from the real title on first save (see post-editor).
  const title = p.title ?? "";
  const slug =
    p.slug || slugify(title) || `entwurf-${randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase
    .from("posts")
    .insert({
      title,
      slug,
      location: p.location || null,
      excerpt: p.excerpt || null,
      body: p.body || null,
      cover_image: p.cover_image || null,
      cover_alt: p.cover_alt || null,
      trip_id: tripId,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      published: p.published ?? false,
      published_at: p.date
        ? new Date(`${p.date}T12:00:00.000Z`).toISOString()
        : p.published
          ? new Date().toISOString()
          : null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Materialise inline :::poll / :::quiz blocks now that the post has an id.
  if (p.body && data?.id) {
    const { body: materialized, created } = await materializeInteractions(
      supabase,
      data.id,
      p.body,
    );
    if (created > 0)
      await supabase.from("posts").update({ body: materialized }).eq("id", data.id);
  }

  // Translate into the other language when created already-published.
  if (p.published && data?.id) {
    await triggerPostTranslation(data.id).catch(() => {});
  }

  // Refresh the cached public pages immediately (all static + ISR now).
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/photos");
  revalidatePath("/map");
  revalidatePath("/trips");
  revalidatePath(`/posts/${slug}`);

  // Newly published → tell readers who opted in.
  if (p.published) {
    // after(), not a floating promise — see @/lib/after-response.
    afterResponse("notify.viewers", () =>
      notifyViewers({
        title: `New story: ${title}`,
        body: p.excerpt ?? undefined,
        url: `${env.siteUrl}/posts/${slug}`,
      }),
    );
  }

  return NextResponse.json(data, { status: 201 });
}
