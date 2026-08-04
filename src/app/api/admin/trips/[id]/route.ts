import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { triggerTripTranslation } from "@/lib/ai/translate";

// Translation runs in-process when no Edge Function is configured (see
// @/lib/ai/translate), scheduled with `after()` — so the model calls are billed
// against THIS function's clock even though the response has already gone. The
// body pass is capped at 8000 tokens, which does not fit in Vercel's default 60s
// and a killed function records nothing at all. Raising a cap and raising the
// route's clock are one decision (CLAUDE.md).
export const maxDuration = 180;


function revalidatePublic(slug?: string | null, alsoSlug?: string | null) {
  revalidatePath("/trips");
  revalidatePath("/");
  if (slug) {
    revalidatePath(`/trips/${slug}`);
    revalidatePath(`/trips/${slug}/map`);
  }
  if (alsoSlug && alsoSlug !== slug) {
    revalidatePath(`/trips/${alsoSlug}`);
    revalidatePath(`/trips/${alsoSlug}/map`);
  }
}

const schema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  summary: z.string().optional(),
  ai_context: z.string().optional(),
  cover_image: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
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
  const t = parsed.data;
  const slug = t.slug || slugify(t.title);

  const { data: existing } = await supabase
    .from("trips")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("trips")
    .update({
      title: t.title,
      slug,
      summary: t.summary || null,
      ai_context: t.ai_context || null,
      cover_image: t.cover_image || null,
      start_date: t.start_date || null,
      end_date: t.end_date || null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Translate the trip's title + summary into the other language (background).
  await triggerTripTranslation(id).catch(() => {});

  revalidatePublic(slug, existing?.slug);
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
    .from("trips")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  // Posts keep existing (trip_id is set null by the FK), so just unpin the trip.
  const { error } = await supabase.from("trips").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePublic(existing?.slug);
  return NextResponse.json({ ok: true });
}
