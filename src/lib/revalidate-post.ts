import "server-only";
import { revalidatePath } from "next/cache";
import { logError } from "@/lib/log";

// Post pages are `revalidate = false` — prerendered once and never refreshed on
// a timer. That is deliberate (a travel journal's articles do not change on
// their own), but it means anything that changes what a post page RENDERS has
// to say so, and comments were not saying so.
//
// The effect was hidden rather than absent: the comments component refetches on
// mount, so a reader with JavaScript saw the new comment and nobody noticed the
// server-rendered HTML still showed the list as it stood at the last deploy.
// Crawlers, link previews and the pre-hydration paint all saw the stale one.

/**
 * Refresh the public page a comment lives on.
 *
 * Best-effort: a comment that saved is saved. Failing the request because the
 * cache could not be nudged would turn a working write into an error the
 * visitor has to interpret.
 */
export async function revalidatePostPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  by: { postId: string } | { commentId: string },
): Promise<void> {
  try {
    let postId: string | undefined;
    if ("postId" in by) {
      postId = by.postId;
    } else {
      const { data } = await supabase
        .from("comments")
        .select("post_id")
        .eq("id", by.commentId)
        .maybeSingle();
      postId = (data as { post_id?: string } | null)?.post_id;
    }
    if (!postId) return;

    // Looked up rather than taken from the caller: a client-supplied path is
    // how /api/admin/revalidate became a way to evict any page on the site.
    const { data: post } = await supabase
      .from("posts")
      .select("slug")
      .eq("id", postId)
      .maybeSingle();
    const slug = (post as { slug?: string } | null)?.slug;
    if (slug) revalidatePath(`/posts/${slug}`);
  } catch (e) {
    logError("revalidate.post", e);
  }
}
