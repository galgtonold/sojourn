// Data-access layer. Every function transparently uses Supabase when it's
// configured and falls back to bundled demo content otherwise, so pages never
// have to branch on environment.
//
// Public reads use a cookieless anon client (`getPublicSupabase`) so they work
// at build time (generateStaticParams) as well as at request time. Network or
// query failures degrade gracefully to demo content.
import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { demoComments, demoPosts, demoTrips } from "@/lib/demo";
import {
  emptyReactions,
  type Comment,
  type GeoPoint,
  type Photo,
  type PostSummary,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydratePost(row: any): PostWithRelations {
  return {
    ...row,
    trip: row.trip ?? null,
    photos: (row.photos ?? []).sort(
      (a: Photo, b: Photo) => a.sort_order - b.sort_order,
    ),
    locations: (row.locations ?? []).sort(
      (a: GeoPoint, b: GeoPoint) => a.sort_order - b.sort_order,
    ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tracks: (row.tracks ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      distance_m: t.distance_m,
      geojson: t.geojson,
    })),
    reactions: summarizeReactions(row.reactions),
    comment_count: row.comments?.[0]?.count ?? 0,
  };
}

const POST_SELECT = `
  *,
  trip:trips(*),
  photos(*),
  locations(*),
  tracks(*),
  reactions(kind),
  comments(count)
`;

export async function getPublishedPosts(): Promise<PostWithRelations[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return demoPosts;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .order("published_at", { ascending: false });
    if (error || !data) return demoPosts;
    return data.map(hydratePost);
  } catch {
    return demoPosts;
  }
}

const SUMMARY_SELECT =
  "id, slug, title, excerpt, location, cover_image, cover_alt, trip_id, published_at";

// Lightweight, paginated listing query — only the columns a card needs.
export async function getPostSummaries({
  limit = 12,
  offset = 0,
  tripId,
}: { limit?: number; offset?: number; tripId?: string } = {}): Promise<{
  posts: PostSummary[];
  total: number;
}> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const all: PostSummary[] = tripId
      ? demoPosts.filter((p) => p.trip_id === tripId)
      : demoPosts;
    return { posts: all.slice(offset, offset + limit), total: all.length };
  }
  try {
    let q = supabase
      .from("posts")
      .select(SUMMARY_SELECT, { count: "exact" })
      .eq("published", true);
    if (tripId) q = q.eq("trip_id", tripId);
    const { data, error, count } = await q
      .order("published_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error || !data) return { posts: [], total: 0 };
    return { posts: data as PostSummary[], total: count ?? data.length };
  } catch {
    return { posts: [], total: 0 };
  }
}

// All published posts for a single trip (bounded set) — used by the trip page
// and its journey map.
export async function getPublishedPostsByTrip(
  tripId: string,
): Promise<PostWithRelations[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return demoPosts.filter((p) => p.trip_id === tripId);
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .eq("trip_id", tripId)
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    return data.map(hydratePost);
  } catch {
    return [];
  }
}

export async function getPostBySlug(
  slug: string,
): Promise<PostWithRelations | null> {
  const supabase = getPublicSupabase();
  if (!supabase) return demoPosts.find((p) => p.slug === slug) ?? null;
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();
    if (error || !data) return null;
    return hydratePost(data);
  } catch {
    return null;
  }
}

export async function getTrips(): Promise<Trip[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return demoTrips;
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .order("start_date", { ascending: false });
    if (error || !data) return demoTrips;
    return data as Trip[];
  } catch {
    return demoTrips;
  }
}

export async function searchPosts(query: string): Promise<PostWithRelations[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = getPublicSupabase();
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

  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .textSearch("search_tsv", q, { type: "websearch", config: "simple" })
      .limit(50);
    if (error || !data) return [];
    return data.map(hydratePost);
  } catch {
    return [];
  }
}

const COMMENT_SELECT =
  "id, post_id, parent_id, author_name, body, created_at, comment_likes(count)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function hydrateComment(row: any): Comment {
  return {
    id: row.id,
    post_id: row.post_id,
    parent_id: row.parent_id,
    author_name: row.author_name,
    body: row.body,
    created_at: row.created_at,
    like_count: row.comment_likes?.[0]?.count ?? 0,
  };
}

export async function getComments(postId: string): Promise<Comment[]> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return demoComments.filter((c) => c.post_id === postId);
  }
  try {
    // Newest 200 for first paint; the client paginates older ones via the API.
    const { data, error } = await supabase
      .from("comments")
      .select(COMMENT_SELECT)
      .eq("post_id", postId)
      .eq("hidden", false)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map(hydrateComment).reverse();
  } catch {
    return [];
  }
}

// Authenticated (admin) fetch of any post by id — including drafts — for the
// preview screen. Relies on RLS granting authenticated full read access.
export async function getPostForPreview(
  id: string,
): Promise<PostWithRelations | null> {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return hydratePost(data);
}
