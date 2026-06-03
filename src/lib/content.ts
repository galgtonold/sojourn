// Data-access layer. Every function transparently uses Supabase when it's
// configured and falls back to bundled demo content otherwise, so pages never
// have to branch on environment.
import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  demoComments,
  demoPosts,
  demoTrips,
} from "@/lib/demo";
import {
  emptyReactions,
  type Comment,
  type GeoPoint,
  type Photo,
  type PostWithRelations,
  type ReactionKind,
  type ReactionSummary,
  type Trip,
} from "@/lib/types";

export const DEMO_MODE = !isSupabaseConfigured;

function summarizeReactions(
  rows: { kind: string }[] | null | undefined,
): ReactionSummary {
  const out = emptyReactions();
  for (const r of rows ?? []) {
    if (r.kind in out) out[r.kind as ReactionKind] += 1;
  }
  return out;
}

async function hydratePost(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
): Promise<PostWithRelations> {
  return {
    ...row,
    trip: row.trip ?? null,
    photos: (row.photos ?? []).sort(
      (a: Photo, b: Photo) => a.sort_order - b.sort_order,
    ),
    locations: (row.locations ?? []).sort(
      (a: GeoPoint, b: GeoPoint) => a.sort_order - b.sort_order,
    ),
    reactions: summarizeReactions(row.reactions),
    comment_count: row.comments?.[0]?.count ?? 0,
  };
}

const POST_SELECT = `
  *,
  trip:trips(*),
  photos(*),
  locations(*),
  reactions(kind),
  comments(count)
`;

export async function getPublishedPosts(): Promise<PostWithRelations[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return demoPosts;

  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("published", true)
    .order("published_at", { ascending: false });

  if (error || !data) return demoPosts;
  return Promise.all(data.map(hydratePost));
}

export async function getPostBySlug(
  slug: string,
): Promise<PostWithRelations | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return demoPosts.find((p) => p.slug === slug) ?? null;

  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();

  if (error || !data) return null;
  return hydratePost(data);
}

export async function getTrips(): Promise<Trip[]> {
  const supabase = await getServerSupabase();
  if (!supabase) return demoTrips;
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("start_date", { ascending: false });
  if (error || !data) return demoTrips;
  return data as Trip[];
}

export async function searchPosts(
  query: string,
): Promise<PostWithRelations[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = await getServerSupabase();
  if (!supabase) {
    const needle = q.toLowerCase();
    return demoPosts.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        (p.excerpt ?? "").toLowerCase().includes(needle) ||
        (p.location ?? "").toLowerCase().includes(needle) ||
        (p.body ?? "").toLowerCase().includes(needle),
    );
  }

  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("published", true)
    .textSearch("search_tsv", q, { type: "websearch", config: "simple" });

  if (error || !data) return [];
  return Promise.all(data.map(hydratePost));
}

export async function getComments(postId: string): Promise<Comment[]> {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return demoComments.filter((c) => c.post_id === postId) as Comment[];
  }
  const { data, error } = await supabase
    .from("comments")
    .select("*")
    .eq("post_id", postId)
    .eq("hidden", false)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return data as Comment[];
}
