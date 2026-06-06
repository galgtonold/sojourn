import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";

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
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const p = parsed.data;

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

  const update: Record<string, unknown> = {
    title: p.title.trim(),
    excerpt: p.excerpt?.trim() || null,
    body: p.body,
    location: p.location?.trim() || cover?.place_name || null,
    lat: p.lat ?? cover?.lat ?? null,
    lng: p.lng ?? cover?.lng ?? null,
  };
  if (cover?.url) update.cover_image = cover.url;

  const { error } = await supabase.from("posts").update(update).eq("id", p.postId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
