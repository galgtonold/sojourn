import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { computeEnrichment } from "@/lib/ai/enrich";

export const maxDuration = 60;

const schema = z.object({
  photoId: z.string().uuid(),
  force: z.boolean().optional(),
});

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // RLS ensures the caller may only read/update photos within their scope.
  const { data: photo } = await supabase
    .from("photos")
    .select("id, url, lat, lng, ai_description, place_name, enriched_at")
    .eq("id", parsed.data.photoId)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (photo.enriched_at && !parsed.data.force) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  if (!isAiConfigured) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { ai_description, place_name } = await computeEnrichment(photo);

  await supabase
    .from("photos")
    .update({
      ai_description,
      place_name,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", photo.id);

  return NextResponse.json({ ok: true, ai_description, place_name });
}
