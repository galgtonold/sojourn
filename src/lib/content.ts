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
import { getAdminSupabase } from "@/lib/supabase/admin";
import { isSupabaseConfigured, isEmbeddingsConfigured } from "@/lib/env";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";
import { demoComments, demoPosts, demoTrips } from "@/lib/demo";
import {
  emptyReactions,
  type Comment,
  type GeoPoint,
  type Photo,
  type PhotoSearchResult,
  type PhotoTranslation,
  type PostSummary,
  type PostTranslation,
  type PostWithRelations,
  type ReactionKind,
  type ReactionSummary,
  type Trip,
} from "@/lib/types";
import type { Locale } from "@/lib/i18n";

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
      started_at: t.started_at ?? null,
      ended_at: t.ended_at ?? null,
      geojson: t.geojson,
    })),
    reactions: summarizeReactions(row.reactions),
    comment_count: row.comments?.[0]?.count ?? 0,
  };
}

const POST_SELECT = `
  *,
  trip:trips(id, slug, title, summary, cover_image, start_date, end_date),
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
  "id, slug, title, excerpt, location, cover_image, cover_alt, trip_id, published_at, source_locale, i18n";

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
      .select(
        "id, slug, title, summary, cover_image, start_date, end_date, source_locale, i18n",
      )
      .order("start_date", { ascending: false });
    if (error || !data) return demoTrips;
    return data as Trip[];
  } catch {
    return demoTrips;
  }
}

// Embed the query for the semantic half of hybrid search. Returns null when no
// embeddings provider is configured or the call fails — callers then fall back
// to pure full-text ranking, which the RPCs handle when query_embedding is null.
async function embedQuery(q: string): Promise<number[] | null> {
  if (!isEmbeddingsConfigured) return null;
  try {
    return await embedText(q, { operation: "search_embed" });
  } catch {
    return null;
  }
}

// Re-fetch full rows by id and restore the fusion ranking the RPC returned (a
// PostgREST `in(...)` filter does not preserve order).
function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  return [...rows].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}

// A single geotagged photo with just enough of its parent post to link back —
// deliberately light (no full post hydration) so the global photo map scales.
export type GeoPhoto = {
  id: string;
  lat: number;
  lng: number;
  url: string;
  caption: string | null;
  blurhash: string | null;
  postSlug: string;
  postTitle: string;
  i18n?: Partial<Record<Locale, PhotoTranslation>>;
  postI18n?: Partial<Record<Locale, PostTranslation>>;
};

function demoGeoPhotos(): GeoPhoto[] {
  return demoPosts.flatMap((post) =>
    post.published
      ? post.photos
          .filter((ph) => ph.lat != null && ph.lng != null && ph.url)
          .map((ph) => ({
            id: ph.id,
            lat: ph.lat as number,
            lng: ph.lng as number,
            url: ph.url as string,
            caption: ph.caption,
            blurhash: ph.blurhash,
            postSlug: post.slug,
            postTitle: post.title,
          }))
      : [],
  );
}

// Every geotagged photo across published posts, for the global photo map.
export async function getGeotaggedPhotos(): Promise<GeoPhoto[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return demoGeoPhotos();
  try {
    const { data, error } = await supabase
      .from("photos")
      .select(
        "id, url, caption, blurhash, lat, lng, i18n, posts!inner(slug, title, published, i18n)",
      )
      .not("lat", "is", null)
      .not("lng", "is", null)
      .eq("posts.published", true)
      .order("taken_at", { ascending: true, nullsFirst: false });
    if (error || !data) return demoGeoPhotos();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).flatMap((r) => {
      const post = Array.isArray(r.posts) ? r.posts[0] : r.posts;
      if (!r.url || r.lat == null || r.lng == null || !post) return [];
      return [
        {
          id: r.id,
          lat: r.lat,
          lng: r.lng,
          url: r.url,
          caption: r.caption,
          blurhash: r.blurhash,
          postSlug: post.slug,
          postTitle: post.title,
          i18n: r.i18n ?? undefined,
          postI18n: post.i18n ?? undefined,
        },
      ];
    });
  } catch {
    return demoGeoPhotos();
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
    const embedding = await embedQuery(q);
    const { data: ranked, error } = await supabase.rpc("search_posts_hybrid", {
      query_text: q,
      query_embedding: embedding ? toVectorLiteral(embedding) : null,
      match_count: 50,
    });
    if (error) throw error;
    const ids = ((ranked ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];

    const { data, error: fetchErr } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .in("id", ids);
    if (fetchErr || !data) return [];
    return orderByIds(data.map(hydratePost), ids);
  } catch {
    // RPC/migration not present (older deployments): plain full-text search.
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
}

// Columns a photo search card needs, plus its parent post for linking. The
// `!inner` join + published filter mirror the "read photos of published posts"
// RLS policy (belt-and-suspenders: anon can only read these rows anyway).
const PHOTO_SEARCH_SELECT =
  "id, url, caption, alt, ai_description, place_name, width, height, blurhash, lat, lng, i18n, post:posts!inner(slug, title, published, i18n)";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function hydratePhotoResult(row: any): PhotoSearchResult {
  const post = Array.isArray(row.post) ? row.post[0] : row.post;
  return {
    id: row.id,
    url: row.url ?? null,
    caption: row.caption ?? null,
    alt: row.alt ?? null,
    ai_description: row.ai_description ?? null,
    place_name: row.place_name ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    blurhash: row.blurhash ?? null,
    lat: row.lat ?? null,
    lng: row.lng ?? null,
    post_slug: post?.slug ?? "",
    post_title: post?.title ?? "",
    i18n: row.i18n ?? undefined,
    post_i18n: post?.i18n ?? undefined,
  };
}

export async function searchPhotos(
  query: string,
): Promise<PhotoSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = getPublicSupabase();
  if (!supabase) {
    const needle = q.toLowerCase();
    const out: PhotoSearchResult[] = [];
    for (const p of demoPosts) {
      for (const ph of p.photos) {
        const haystack = [ph.caption, ph.alt, p.location, p.title]
          .map((x) => (x ?? "").toLowerCase())
          .join(" ");
        if (haystack.includes(needle)) {
          out.push({
            id: ph.id,
            url: ph.url,
            caption: ph.caption,
            alt: ph.alt,
            ai_description: null,
            place_name: p.location,
            width: ph.width,
            height: ph.height,
            blurhash: ph.blurhash,
            lat: ph.lat,
            lng: ph.lng,
            post_slug: p.slug,
            post_title: p.title,
          });
        }
      }
    }
    return out;
  }

  try {
    const embedding = await embedQuery(q);
    const { data: ranked, error } = await supabase.rpc("search_photos_hybrid", {
      query_text: q,
      query_embedding: embedding ? toVectorLiteral(embedding) : null,
      match_count: 36,
    });
    if (error) throw error;
    const ids = ((ranked ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];

    const { data, error: fetchErr } = await supabase
      .from("photos")
      .select(PHOTO_SEARCH_SELECT)
      .in("id", ids);
    if (fetchErr || !data) return [];
    return orderByIds(data.map(hydratePhotoResult), ids);
  } catch {
    return [];
  }
}

export const COMMENT_SELECT =
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

// Inline interactive blocks for a post — fetched via the service role so the
// correct answer / explanation never reach the client. Returns only safe
// fields. No-ops without a service role (interactions just won't render).
export async function getInteractions(
  postId: string,
): Promise<import("@/lib/types").Interaction[]> {
  const supabase = getAdminSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("interactions")
    .select("id, kind, question, options, sort_order, i18n")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  if (error || !data) return [];
  return data as import("@/lib/types").Interaction[];
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
