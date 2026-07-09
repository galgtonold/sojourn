// Server-side data-access for photos — the seam between the app's photo logic
// and Supabase. Routes/orchestrators call these commands instead of building
// `.from("photos")` chains inline, so the query shape lives in one place and the
// logic (see resolvePhotoOrder in photo-order.ts) stays testable.
import "server-only";
import type { ServerSupabase } from "@/lib/api/admin-route";
import { resolvePhotoOrder } from "@/lib/photo-order";
import type { CaptionSource } from "@/lib/ai/caption-select";
import { embedPhotoRecord } from "@/lib/ai/embed-records";

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

// The fields the captioner needs to decide targets and write the prompt.
export async function fetchCaptionSources(
  supabase: ServerSupabase,
  postId: string,
): Promise<CaptionSource[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("id, ai_description, place_name, caption")
    .eq("post_id", postId);
  if (error) throw new Error(error.message);
  return (data ?? []) as CaptionSource[];
}

// Persist generated captions, refreshing each photo's embedding so the caption
// (part of its searchable text) stays in sync. Returns how many were written.
export async function saveCaptions(
  supabase: ServerSupabase,
  items: { id: string; caption: string }[],
  meta: { postId: string; userId: string },
): Promise<number> {
  let count = 0;
  for (const item of items) {
    const { error } = await supabase
      .from("photos")
      .update({ caption: item.caption?.trim() || null })
      .eq("id", item.id);
    if (error) throw new Error(error.message);
    await embedPhotoRecord(supabase, item.id, {
      operation: "photo_embed",
      postId: meta.postId,
      userId: meta.userId,
    });
    count++;
  }
  return count;
}
