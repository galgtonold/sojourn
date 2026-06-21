import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

// TEMPORARY: inspect the cosine-distance spread of a query against embedded
// posts/photos, to calibrate the search distance threshold. Remove after tuning.
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
  const [posts, photos] = await Promise.all([
    supabase.rpc("search_posts_distances", { query_embedding: lit }),
    supabase.rpc("search_photos_distances", { query_embedding: lit }),
  ]);
  const round = (d: number) => Math.round(d * 1000) / 1000;
  return NextResponse.json({
    q,
    posts: (posts.data ?? []).map((p: { title: string; distance: number }) => ({
      t: p.title,
      d: round(p.distance),
    })),
    photoDistances: (photos.data ?? []).map(
      (p: { distance: number }) => round(p.distance),
    ),
  });
}
