import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { notifyViewers } from "@/lib/notify";
import { env } from "@/lib/env";
import { slugify } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  location: z.string().optional(),
  excerpt: z.string().optional(),
  body: z.string().optional(),
  cover_image: z.string().optional(),
  cover_alt: z.string().optional(),
  trip_id: z.string().uuid().nullable().optional(),
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
  const slug = p.slug || slugify(p.title);

  const { data, error } = await supabase
    .from("posts")
    .insert({
      title: p.title,
      slug,
      location: p.location || null,
      excerpt: p.excerpt || null,
      body: p.body || null,
      cover_image: p.cover_image || null,
      cover_alt: p.cover_alt || null,
      trip_id: p.trip_id || null,
      lat: p.lat ?? null,
      lng: p.lng ?? null,
      published: p.published ?? false,
      published_at: p.published ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Refresh the cached public pages immediately.
  revalidatePath("/");
  revalidatePath("/map");
  revalidatePath("/trips");
  revalidatePath(`/posts/${slug}`);

  // Newly published → tell readers who opted in.
  if (p.published) {
    notifyViewers({
      title: `New story: ${p.title}`,
      body: p.excerpt ?? undefined,
      url: `${env.siteUrl}/posts/${slug}`,
    }).catch(() => {});
  }

  return NextResponse.json(data, { status: 201 });
}
