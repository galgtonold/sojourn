import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";

// TEMPORARY: calibrate the search distance threshold. `?q=` shows the raw cosine
// distances; `?q=&maxd=0.75` also runs the real hybrid search at that threshold
// and reports the resulting story/photo counts + titles. Remove after tuning.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const maxd = url.searchParams.get("maxd");
  const rrfK = url.searchParams.get("rrf");
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

  const out: Record<string, unknown> = {
    q,
    posts: (dPosts.data ?? []).map((p: { title: string; distance: number }) => ({
      t: p.title,
      d: round(p.distance),
    })),
    photoDistances: (dPhotos.data ?? []).map((p: { distance: number }) =>
      round(p.distance),
    ),
  };

  // When maxd is given, run the real hybrid search at that threshold.
  if (maxd != null) {
    const max_distance = Number(maxd);
    const rrf_k = rrfK != null ? Number(rrfK) : 50;
    const [hPosts, hPhotos] = await Promise.all([
      supabase.rpc("search_posts_hybrid", {
        query_text: q,
        query_embedding: lit,
        match_count: 50,
        rrf_k,
        max_distance,
      }),
      supabase.rpc("search_photos_hybrid", {
        query_text: q,
        query_embedding: lit,
        match_count: 36,
        rrf_k,
        max_distance,
      }),
    ]);
    const ids = ((hPosts.data ?? []) as { id: string }[]).map((r) => r.id);
    let titles: string[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("posts")
        .select("id, title")
        .in("id", ids);
      const byId = new Map((data ?? []).map((r) => [r.id, r.title]));
      titles = ids.map((id) => byId.get(id) ?? "?");
    }
    out.hybrid = {
      maxd: max_distance,
      rrf_k,
      postCount: ids.length,
      photoCount: (hPhotos.data ?? []).length,
      topPosts: titles.slice(0, 5),
    };
  }

  return NextResponse.json(out);
}
