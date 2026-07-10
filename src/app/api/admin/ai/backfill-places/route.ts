import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { nearbyPlaces, reverseGeocode } from "@/lib/ai/geocode";

export const maxDuration = 60;

const BATCH = 8;
const schema = z.object({ postId: z.string().uuid().optional() });

// Backfills nearby_places (and place_name when still empty) for located photos
// that have never been looked up. Idempotent: a photo whose nearby_places is
// already set (even to an empty array — "looked, none nearby") is skipped, so
// re-running only catches new/uncovered rows. Reports how many remain, so the
// caller can loop without any single request approaching the time limit.
export const POST = adminRoute(schema, backfillPlaces);

async function backfillPlaces({
  supabase,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  let q = supabase
    .from("photos")
    .select("id, lat, lng, place_name")
    .not("lat", "is", null)
    .not("lng", "is", null)
    .is("nearby_places", null);
  if (input.postId) q = q.eq("post_id", input.postId);
  const { data: pending } = await q;

  const all = pending ?? [];
  if (all.length === 0) return { processed: 0, remaining: 0 };

  const batch = all.slice(0, BATCH);
  await Promise.all(
    batch.map(async (p) => {
      const candidates = await nearbyPlaces(p.lat as number, p.lng as number);
      const place = p.place_name
        ? p.place_name
        : await reverseGeocode(p.lat as number, p.lng as number);
      await supabase
        .from("photos")
        .update({
          nearby_places: candidates,
          ...(place && !p.place_name ? { place_name: place } : {}),
        })
        .eq("id", p.id);
    }),
  );

  return {
    processed: batch.length,
    remaining: Math.max(0, all.length - batch.length),
  };
}
