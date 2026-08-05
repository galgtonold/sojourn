import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { notifyViewers } from "@/lib/notify";
import { afterResponse } from "@/lib/after-response";
import { env } from "@/lib/env";
import { slugify } from "@/lib/utils";
import { materializeInteractions } from "@/lib/ai/materialize";
import { embedPostRecord } from "@/lib/ai/embed-records";
import { triggerPostTranslation } from "@/lib/ai/translate";
import { photoPathsForPost, removePhotoObjects } from "@/lib/photo-objects";

// Translation runs in-process when no Edge Function is configured (see
// @/lib/ai/translate), scheduled with `after()` — so the model calls are billed
// against THIS function's clock even though the response has already gone. The
// body pass is capped at 8000 tokens, which does not fit in Vercel's default 60s
// and a killed function records nothing at all. Raising a cap and raising the
// route's clock are one decision (CLAUDE.md).
export const maxDuration = 180;


function revalidatePublic(slug?: string | null, alsoSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/posts");
  revalidatePath("/photos");
  revalidatePath("/map");
  revalidatePath("/trips");
  if (slug) revalidatePath(`/posts/${slug}`);
  if (alsoSlug && alsoSlug !== slug) revalidatePath(`/posts/${alsoSlug}`);
}

const schema = z.object({
  // Optional so a draft can be saved with the title still missing; publishing
  // is gated separately (see the handler).
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

async function requireUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return { supabase: null, user: null };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const p = parsed.data;

  // A draft may be saved with required fields still missing; publishing needs a
  // title and a trip.
  if (p.published && (!p.title || !p.trip_id)) {
    return NextResponse.json({ error: "incomplete-publish" }, { status: 400 });
  }

  // Set published_at on the publish transition (only if not already set); also
  // reuse the post's current slug as a fallback so a titleless draft keeps a
  // valid (placeholder) slug.
  const { data: existing } = await supabase
    .from("posts")
    .select("published, published_at, slug")
    .eq("id", id)
    .maybeSingle();

  const title = p.title ?? "";
  const slug = p.slug || slugify(title) || existing?.slug || id;

  // Materialise inline :::poll / :::quiz blocks the author typed by hand.
  const body = p.body
    ? (await materializeInteractions(supabase, id, p.body)).body
    : null;

  const { data: updated, error } = await supabase
    .from("posts")
    .update({
      title,
      slug,
      location: p.location || null,
      excerpt: p.excerpt || null,
      body,
      cover_image: p.cover_image || null,
      cover_alt: p.cover_alt || null,
      trip_id: p.trip_id || null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      published: p.published ?? false,
      published_at: p.date
        ? new Date(`${p.date}T12:00:00.000Z`).toISOString()
        : p.published && !existing?.published_at
          ? new Date().toISOString()
          : existing?.published_at ?? null,
    })
    .eq("id", id)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // RLS filters rather than errors, so a write this caller may not make comes
  // back as zero rows and no error. Without this the route answered
  // `200 {"ok":true}` for an edit that never happened — the silent no-op the
  // comments moderation route explicitly guards against, in the same codebase.
  if (!updated?.length)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Refresh the post's semantic-search embedding (best-effort, never blocks the
  // save). No-ops when embeddings aren't configured.
  await embedPostRecord(supabase, id, {
    operation: "post_embed",
    postId: id,
    userId: user.id,
  });

  // Kick off background translation into the other language when published
  // (no-op without the Edge Function, or when the content hasn't changed).
  // Awaited only long enough to fire the call; the translation itself runs in
  // the background and flips translation_status to 'ready' when done.
  if (p.published) {
    await triggerPostTranslation(id).catch(() => {});
  }

  // Instantly refresh public pages (incl. the old slug if it changed).
  revalidatePublic(slug, existing?.slug);

  // Fire a viewer notification only when crossing from unpublished → published.
  if (p.published && !existing?.published) {
    // after(), not a floating promise — see @/lib/after-response.
    afterResponse("notify.viewers", () =>
      notifyViewers({
        title: `New story: ${title}`,
        body: p.excerpt ?? undefined,
        url: `${env.siteUrl}/posts/${slug}`,
      }),
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("posts")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  // Read the object paths BEFORE the delete: `photos.post_id` cascades, so a
  // moment later there are no rows left to learn them from — which is how every
  // photograph of a deleted entry stayed live at its original public URL.
  const paths = await photoPathsForPost(id);

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await removePhotoObjects(paths);

  revalidatePublic(existing?.slug);
  return NextResponse.json({ ok: true });
}
