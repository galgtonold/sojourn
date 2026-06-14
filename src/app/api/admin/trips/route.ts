import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { triggerTripTranslation } from "@/lib/ai/translate";

const schema = z.object({
  title: z.string().trim().min(1),
  slug: z.string().trim().optional(),
  summary: z.string().optional(),
  ai_context: z.string().optional(),
  cover_image: z.string().optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
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
  const t = parsed.data;
  const slug = t.slug || slugify(t.title);

  const { data, error } = await supabase
    .from("trips")
    .insert({
      title: t.title,
      slug,
      summary: t.summary || null,
      ai_context: t.ai_context || null,
      cover_image: t.cover_image || null,
      start_date: t.start_date || null,
      end_date: t.end_date || null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (data?.id) await triggerTripTranslation(data.id).catch(() => {});

  revalidatePath("/trips");
  revalidatePath("/");
  revalidatePath(`/trips/${slug}`);

  return NextResponse.json(data, { status: 201 });
}
