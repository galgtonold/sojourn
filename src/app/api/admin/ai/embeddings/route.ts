import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isEmbeddingsConfigured } from "@/lib/env";
import {
  embedBatch,
  postEmbeddingInput,
  photoEmbeddingInput,
  toVectorLiteral,
} from "@/lib/ai/embeddings";
import { reindexPostChunks } from "@/lib/ai/chunk-index";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid().optional(),
  onlyEmpty: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

// Backfills (or refreshes) semantic-search embeddings for posts and photos.
// Idempotent by default (onlyEmpty): only rows missing an embedding are touched.
export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase)
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!isEmbeddingsConfigured)
    return NextResponse.json(
      { error: "Embeddings are not configured" },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { postId, onlyEmpty, limit } = parsed.data;
  const now = new Date().toISOString();

  // ── posts ──────────────────────────────────────────────────────────────────
  let postsQ = supabase
    .from("posts")
    .select("id, title, excerpt, body, location");
  if (postId) postsQ = postsQ.eq("id", postId);
  if (onlyEmpty) postsQ = postsQ.is("embedding", null);
  const { data: posts } = await postsQ.limit(limit);

  let postCount = 0;
  if (posts && posts.length > 0) {
    const inputs = posts.map((p) => postEmbeddingInput(p));
    const vectors = await embedBatch(inputs, {
      operation: "post_embed",
      userId: user.id,
    });
    for (let i = 0; i < posts.length; i++) {
      const vec = vectors[i];
      if (!vec) continue;
      await supabase
        .from("posts")
        .update({ embedding: toVectorLiteral(vec), embedded_at: now })
        .eq("id", posts[i].id);
      postCount++;
    }
  }

  // ── photos ───────────────────────────────────────────────────────────────—
  let photosQ = supabase
    .from("photos")
    .select("id, caption, alt, ai_description, place_name");
  if (postId) photosQ = photosQ.eq("post_id", postId);
  if (onlyEmpty) photosQ = photosQ.is("embedding", null);
  const { data: photos } = await photosQ.limit(limit);

  let photoCount = 0;
  if (photos && photos.length > 0) {
    // Skip photos with no text to embed (nothing meaningful to match on).
    const targets = photos.filter((p) => photoEmbeddingInput(p).length > 0);
    const vectors = await embedBatch(
      targets.map((p) => photoEmbeddingInput(p)),
      { operation: "photo_embed", userId: user.id },
    );
    for (let i = 0; i < targets.length; i++) {
      const vec = vectors[i];
      if (!vec) continue;
      await supabase
        .from("photos")
        .update({ embedding: toVectorLiteral(vec), embedded_at: now })
        .eq("id", targets[i].id);
      photoCount++;
    }
  }

  // ── post chunks (passage embeddings) ───────────────────────────────────────
  // Same freshness model as the whole-post embeddings above: refreshed here.
  // `onlyEmpty` skips posts that already have chunks; a full refresh rebuilds.
  let chunkQ = supabase
    .from("posts")
    .select("id, title, excerpt, body, location, source_locale, i18n")
    .eq("published", true);
  if (postId) chunkQ = chunkQ.eq("id", postId);
  const { data: chunkPosts } = await chunkQ.limit(limit);

  let chunkCount = 0;
  for (const p of chunkPosts ?? []) {
    if (onlyEmpty) {
      const { count } = await supabase
        .from("post_chunks")
        .select("id", { count: "exact", head: true })
        .eq("post_id", p.id);
      if (count && count > 0) continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunkCount += await reindexPostChunks(supabase, p as any, {
      operation: "chunk_embed",
      userId: user.id,
    });
  }

  return NextResponse.json({
    posts: postCount,
    photos: photoCount,
    chunks: chunkCount,
  });
}
