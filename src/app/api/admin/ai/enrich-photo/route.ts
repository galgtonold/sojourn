import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { isAiConfigured } from "@/lib/env";
import { computeEnrichment } from "@/lib/ai/enrich";

export const maxDuration = 60;

const schema = z.object({
  photoId: z.string().uuid(),
  force: z.boolean().optional(),
});

export const POST = adminRoute(schema, enrichPhoto);

async function enrichPhoto({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  // RLS ensures the caller may only read/update photos within their scope.
  const { data: photo } = await supabase
    .from("photos")
    .select("id, url, lat, lng, ai_description, place_name, enriched_at, post_id")
    .eq("id", input.photoId)
    .maybeSingle();
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (photo.enriched_at && !input.force) {
    return { ok: true, skipped: true };
  }
  if (!isAiConfigured) {
    return { ok: true, skipped: true };
  }

  const { ai_description, place_name } = await computeEnrichment(photo, {
    operation: "enrich",
    postId: photo.post_id,
    userId: user.id,
  });

  await supabase
    .from("photos")
    .update({
      ai_description,
      place_name,
      enriched_at: new Date().toISOString(),
    })
    .eq("id", photo.id);

  return { ok: true, ai_description, place_name };
}
