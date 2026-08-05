import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { logError } from "@/lib/log";

// Deleting the row is not deleting the photograph.
//
// `photos.post_id` cascades, so removing an entry removes its photo ROWS — and
// nothing removed the objects. The bucket's read policy is
// `using (bucket_id = 'photos')`, unconditional, with no row to consult: the
// original public URL kept serving the image after the entry was gone.
//
// On a travel journal that is not only a disk-space problem. A delete is often
// *because* the photograph should go — somebody in the frame asked, or the
// location should not be public — and the URL is already in the page HTML that
// every cache, feed reader and archive saw.
//
// The single-photo delete button did try, from the browser session client, and
// its result was discarded. 0043 narrowed the bucket's delete policy to
// `is_owner()` for good reasons ("overwriting and destroying other people's
// media is curation, not authoring"), which left that call asserting an outcome
// a collaborator can no longer produce: the row went, the file stayed, and the
// UI said it worked.
//
// So object removal happens server-side, with the service role, only after the
// caller's right to delete the row has been proven by the row delete itself.

/**
 * Remove objects from the photos bucket.
 *
 * Best-effort and never throws: the rows are already gone by the time this
 * runs, and failing the request afterwards would report a delete that did
 * happen as a delete that did not. Failures are logged instead of vanishing,
 * which is the part that was missing.
 */
export async function removePhotoObjects(
  paths: (string | null | undefined)[],
): Promise<{ removed: number; failed: boolean }> {
  const keys = [...new Set(paths.filter((p): p is string => !!p))];
  if (!keys.length) return { removed: 0, failed: false };

  const admin = getAdminSupabase();
  if (!admin) {
    // Without a service-role key nothing can remove these, so say so rather
    // than orphaning them quietly.
    logError("storage.orphaned", {
      reason: "no service-role key configured",
      count: keys.length,
    });
    return { removed: 0, failed: true };
  }

  const { error } = await admin.storage.from("photos").remove(keys);
  if (error) {
    logError("storage.remove", { count: keys.length, message: error.message });
    return { removed: 0, failed: true };
  }
  return { removed: keys.length, failed: false };
}

/** Every stored object belonging to a post, read before its rows disappear. */
export async function photoPathsForPost(postId: string): Promise<string[]> {
  const admin = getAdminSupabase();
  if (!admin) return [];
  const { data } = await admin
    .from("photos")
    .select("storage_path")
    .eq("post_id", postId);
  return ((data ?? []) as { storage_path: string | null }[])
    .map((r) => r.storage_path)
    .filter((p): p is string => !!p);
}
