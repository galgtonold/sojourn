import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { isAiConfigured } from "@/lib/env";
import { computeEnrichment } from "@/lib/ai/enrich";

export const maxDuration = 60;

const BATCH = 4;
const schema = z.object({ postId: z.string().uuid() });

// Enriches up to BATCH pending photos per call and reports how many remain, so
// the client can loop without any single request approaching the time limit.
export const POST = adminRoute(schema, enrichPost);

async function enrichPost({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { data: pending } = await supabase
    .from("photos")
    .select("id, url, lat, lng, ai_description, place_name, nearby_places, enriched_at")
    .eq("post_id", input.postId)
    .is("enriched_at", null);

  const all = pending ?? [];
  if (!isAiConfigured || all.length === 0) {
    return { remaining: 0, processed: 0 };
  }

  const batch = all.slice(0, BATCH);
  await Promise.all(
    batch.map(async (p) => {
      const e = await computeEnrichment(p, {
        operation: "enrich",
        postId: input.postId,
        userId: user.id,
      });
      await supabase
        .from("photos")
        .update({ ...e, enriched_at: new Date().toISOString() })
        .eq("id", p.id);
    }),
  );

  return {
    remaining: Math.max(0, all.length - batch.length),
    processed: batch.length,
  };
}
