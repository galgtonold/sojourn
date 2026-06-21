import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { embedBatch, toVectorLiteral } from "@/lib/ai/embeddings";
import { buildPostChunks } from "@/lib/ai/chunk";
import type { UsageMeta } from "@/lib/ai/deepseek";

type ChunkPost = Parameters<typeof buildPostChunks>[0] & { id: string };

// Rebuild the chunk index for one post: regenerate its chunks, embed them, and
// replace the post's existing chunks. Returns how many chunks were written.
// `supabase` must be a client allowed to write post_chunks (service role, or the
// authenticated admin). Call this whenever a post's content/translations change.
export async function reindexPostChunks(
  supabase: SupabaseClient,
  post: ChunkPost,
  meta?: UsageMeta,
): Promise<number> {
  const chunks = buildPostChunks(post);
  await supabase.from("post_chunks").delete().eq("post_id", post.id);
  if (chunks.length === 0) return 0;

  const vectors = await embedBatch(
    chunks.map((c) => c.content),
    { ...meta, operation: "chunk_embed" },
  );
  const now = new Date().toISOString();
  const rows = chunks.map((c, i) => ({
    post_id: post.id,
    locale: c.locale,
    kind: c.kind,
    idx: c.idx,
    content: c.content,
    embedding: vectors[i] ? toVectorLiteral(vectors[i] as number[]) : null,
    embedded_at: vectors[i] ? now : null,
  }));
  const { error } = await supabase.from("post_chunks").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// Drop a post's chunks — e.g. when it is unpublished or deleted.
export async function clearPostChunks(
  supabase: SupabaseClient,
  postId: string,
): Promise<void> {
  await supabase.from("post_chunks").delete().eq("post_id", postId);
}
