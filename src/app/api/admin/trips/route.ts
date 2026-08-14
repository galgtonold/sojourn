import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { resolveSlug } from "@/lib/slug";
import { PLACEHOLDER_SLUG_PREFIXES } from "@/lib/utils";
import { triggerTripTranslation } from "@/lib/ai/translate";

// Translation runs in-process when no Edge Function is configured (see
// @/lib/ai/translate), scheduled with `after()` — so the model calls are billed
// against THIS function's clock even though the response has already gone. The
// body pass is capped at 8000 tokens, which does not fit in Vercel's default 60s
// and a killed function records nothing at all. Raising a cap and raising the
// route's clock are one decision (CLAUDE.md).
export const maxDuration = 180;


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
  const slug = resolveSlug(
    t.slug,
    t.title,
    `${PLACEHOLDER_SLUG_PREFIXES[1]}${randomUUID().slice(0, 8)}`,
  );

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
  revalidatePath(`/trips/${slug}/map`);

  return NextResponse.json(data, { status: 201 });
}
