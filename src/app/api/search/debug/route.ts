import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

// TEMPORARY: re-calibrate the search distance threshold. `?q=` returns the raw
// cosine distances (nearest first) for posts + photos. Remove after tuning.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const supabase = getPublicSupabase();
  if (!supabase || !q) return NextResponse.json({ error: "no q / no db" });

  let emb: number[] | null = null;
  try {
    emb = await embedText(q, { operation: "search_embed" });
  } catch (e) {
    return NextResponse.json({ error: "embed failed", detail: String(e) });
  }
  if (!emb) return NextResponse.json({ error: "no embedding provider" });

  const lit = toVectorLiteral(emb);
  const round = (d: number) => Math.round(d * 1000) / 1000;
  const [dPosts, dPhotos] = await Promise.all([
    supabase.rpc("search_posts_distances", { query_embedding: lit }),
    supabase.rpc("search_photos_distances", { query_embedding: lit }),
  ]);
  return NextResponse.json({
    q,
    posts: (dPosts.data ?? []).map((p: { title: string; distance: number }) => ({
      t: p.title,
      d: round(p.distance),
    })),
    photoDistances: (dPhotos.data ?? []).map((p: { distance: number }) =>
      round(p.distance),
    ),
  });
}
