import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { notifyViewers } from "@/lib/notify";
import { env } from "@/lib/env";
import { slugify } from "@/lib/utils";

function revalidatePublic(slug?: string | null, alsoSlug?: string | null) {
  revalidatePath("/");
  revalidatePath("/map");
  revalidatePath("/trips");
  if (slug) revalidatePath(`/posts/${slug}`);
  if (alsoSlug && alsoSlug !== slug) revalidatePath(`/posts/${alsoSlug}`);
}

const schema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  location: z.string().optional(),
  excerpt: z.string().optional(),
  body: z.string().optional(),
  cover_image: z.string().optional(),
  cover_alt: z.string().optional(),
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
  const slug = p.slug || slugify(p.title);

  // Set published_at on the publish transition (only if not already set).
  const { data: existing } = await supabase
    .from("posts")
    .select("published, published_at, slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("posts")
    .update({
      title: p.title,
      slug,
      location: p.location || null,
      excerpt: p.excerpt || null,
      body: p.body || null,
      cover_image: p.cover_image || null,
      cover_alt: p.cover_alt || null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      published: p.published ?? false,
      published_at:
        p.published && !existing?.published_at
          ? new Date().toISOString()
          : existing?.published_at ?? null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Instantly refresh public pages (incl. the old slug if it changed).
  revalidatePublic(slug, existing?.slug);

  // Fire a viewer notification only when crossing from unpublished → published.
  if (p.published && !existing?.published) {
    notifyViewers({
      title: `New story: ${p.title}`,
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
