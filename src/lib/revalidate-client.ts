// Bust the cached public post page so admin edits (photos, tracks, interactions
// — each persisted directly from its manager) appear immediately. Best effort:
// a failure just means the page waits for its next on-demand revalidation.
export async function revalidatePublicPost(slug: string): Promise<void> {
  try {
    await fetch("/api/admin/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: `/posts/${slug}` }),
    });
  } catch {
    /* best effort */
  }
}
