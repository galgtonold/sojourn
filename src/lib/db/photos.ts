// Server-side data-access for photos — the seam between the app's photo logic
// and Supabase. Routes/orchestrators call these commands instead of building
// `.from("photos")` chains inline, so the query shape lives in one place and the
// logic (see resolvePhotoOrder in photo-order.ts) stays testable.
import "server-only";
import type { ServerSupabase } from "@/lib/api/admin-route";
import { resolvePhotoOrder } from "@/lib/photo-order";

// Persist a photo order for a post: write a dense, unique sort_order = position,
// and set whether this is a manual arrangement. Returns the resolved id order.
export async function reorderPhotos(
  supabase: ServerSupabase,
  postId: string,
  input: { order?: string[]; mode?: "time" },
): Promise<{ orderedIds: string[]; manual: boolean }> {
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, taken_at, created_at, sort_order")
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
  const photos = rows ?? [];
  if (!photos.length) return { orderedIds: [], manual: false };

  const { orderedIds, manual } = resolvePhotoOrder(photos, input);

  for (let i = 0; i < orderedIds.length; i++) {
    const { error: uErr } = await supabase
      .from("photos")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (uErr) throw new Error(uErr.message);
  }
  const { error: pErr } = await supabase
    .from("posts")
    .update({ photos_manual_order: manual })
    .eq("id", postId);
  if (pErr) throw new Error(pErr.message);

  return { orderedIds, manual };
}
