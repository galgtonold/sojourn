import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { computeEnrichment } from "@/lib/ai/enrich";

export const maxDuration = 60;

const BATCH = 4;
const schema = z.object({ postId: z.string().uuid() });

// Enriches up to BATCH pending photos per call and reports how many remain, so
// the client can loop without any single request approaching the time limit.
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });

  const { data: pending } = await supabase
    .from("photos")
    .select("id, url, lat, lng, ai_description, place_name, enriched_at")
    .eq("post_id", parsed.data.postId)
    .is("enriched_at", null);

  const all = pending ?? [];
  if (!isAiConfigured || all.length === 0) {
    return NextResponse.json({ remaining: 0, processed: 0 });
  }

  const batch = all.slice(0, BATCH);
  await Promise.all(
    batch.map(async (p) => {
      const e = await computeEnrichment(p);
      await supabase
        .from("photos")
        .update({ ...e, enriched_at: new Date().toISOString() })
        .eq("id", p.id);
    }),
  );

  return NextResponse.json({
    remaining: Math.max(0, all.length - batch.length),
    processed: batch.length,
  });
}
