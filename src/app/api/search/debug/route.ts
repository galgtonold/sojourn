import { NextResponse } from "next/server";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";
import { reindexPostChunks } from "@/lib/ai/chunk-index";

// TEMPORARY: `?backfill=1` (re)builds chunk embeddings for every published post;
// `?q=` reports the nearest chunk distance per post + photo distances, to
// re-calibrate the threshold for the chunked index. Remove after tuning.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (url.searchParams.get("backfill")) {
    const admin = getAdminSupabase();
    if (!admin) return NextResponse.json({ error: "no service role" });
    const { data: posts, error } = await admin
      .from("posts")
      .select("id, title, excerpt, body, location, source_locale, i18n")
      .eq("published", true);
    if (error) return NextResponse.json({ error: error.message });
    let chunks = 0;
    for (const p of posts ?? []) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chunks += await reindexPostChunks(admin, p as any, {
          operation: "chunk_embed",
        });
      } catch (e) {
        return NextResponse.json({ error: "reindex failed", detail: String(e) });
      }
    }
    return NextResponse.json({ posts: (posts ?? []).length, chunks });
  }

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
  const [chunks, photos] = await Promise.all([
    supabase.rpc("debug_chunk_distances", { query_embedding: lit }),
    supabase.rpc("search_photos_distances", { query_embedding: lit }),
  ]);
  return NextResponse.json({
    q,
    posts: (chunks.data ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((c: any) => ({ t: c.title, d: round(c.dist), k: c.kind, l: c.locale }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => a.d - b.d),
    photoDistances: (photos.data ?? []).map((p: { distance: number }) =>
      round(p.distance),
    ),
  });
}
