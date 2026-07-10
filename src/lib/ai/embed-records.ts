// Server-only helpers that (re)compute semantic-search embeddings for a single
// post or photo and persist them. Best-effort by design: an embeddings hiccup
// (or no configured provider) never disrupts the enrichment flow that called it
// — the /api/admin/ai/embeddings backfill is always there to catch up.
//
// These re-read the row's current text so they stay correct no matter which
// stage of the pipeline triggers them (e.g. a photo embedded after its AI
// description lands, then again once captions/alt text are written).
import "server-only";
import { isEmbeddingsConfigured } from "@/lib/env";
import {
  embedText,
  photoEmbeddingInput,
  postEmbeddingInput,
  toVectorLiteral,
} from "@/lib/ai/embeddings";
import type { UsageMeta } from "@/lib/ai/deepseek";

// The Supabase client is intentionally loose-typed: callers pass either the
// request-scoped (RLS) client or the admin client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const now = () => new Date().toISOString();

export async function embedPhotoRecord(
  supabase: Db,
  photoId: string,
  meta?: UsageMeta,
): Promise<void> {
  if (!isEmbeddingsConfigured) return;
  try {
    const { data: photo } = await supabase
      .from("photos")
      .select("id, caption, alt, ai_description, place_name, nearby_places")
      .eq("id", photoId)
      .maybeSingle();
    if (!photo) return;
    const vec = await embedText(photoEmbeddingInput(photo), meta);
    if (!vec) return;
    await supabase
      .from("photos")
      .update({ embedding: toVectorLiteral(vec), embedded_at: now() })
      .eq("id", photoId);
  } catch {
    /* best-effort */
  }
}

export async function embedPostRecord(
  supabase: Db,
  postId: string,
  meta?: UsageMeta,
): Promise<void> {
  if (!isEmbeddingsConfigured) return;
  try {
    const { data: post } = await supabase
      .from("posts")
      .select("id, title, excerpt, body, location, place_index")
      .eq("id", postId)
      .maybeSingle();
    if (!post) return;
    const vec = await embedText(postEmbeddingInput(post), meta);
    if (!vec) return;
    await supabase
      .from("posts")
      .update({ embedding: toVectorLiteral(vec), embedded_at: now() })
      .eq("id", postId);
  } catch {
    /* best-effort */
  }
}
