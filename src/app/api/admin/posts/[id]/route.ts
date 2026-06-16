import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { notifyViewers } from "@/lib/notify";
import { env } from "@/lib/env";
import { slugify } from "@/lib/utils";
import { materializeInteractions } from "@/lib/ai/materialize";
import { embedPostRecord } from "@/lib/ai/embed-records";
import { triggerPostTranslation } from "@/lib/ai/translate";

function revalidatePublic(slug?: string | null, alsoSlug?: string | null) {
  revalidatePath("/");
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

  const { error } = await supabase
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
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    notifyViewers({
      title: `New story: ${title}`,
      body: p.excerpt ?? undefined,
      url: `${env.siteUrl}/posts/${slug}`,
    }).catch(() => {});
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

  const { error } = await supabase.from("posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePublic(existing?.slug);
  return NextResponse.json({ ok: true });
}
