// Data-access layer. Supabase is required (see env.ts); the client wrappers
// throw if it isn't configured.
//
// Public reads use a cookieless anon client (`getPublicSupabase`) so they work
// at build time (generateStaticParams) as well as at request time. A network or
// query failure returns empty rather than crashing the page — never fabricated
// content, so a transient outage can't masquerade as real data.
import "server-only";
import { getPublicSupabase } from "@/lib/supabase/public";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import { embedText, toVectorLiteral } from "@/lib/ai/embeddings";
import { simplifyTrackGeoJson } from "@/lib/simplify-track";
import { OVERVIEW_TOLERANCE_M } from "@/lib/map-lod";
import { orderByGallery } from "@/lib/photo-order";
import { buildExpandedTsQuery } from "@/lib/search-expand";
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
  type Track,
  type Trip,
} from "@/lib/types";
import { LOCALES, type Locale } from "@/lib/i18n";

export function summarizeReactions(
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
    photos: orderByGallery(row.photos ?? []),
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
  };
}

// Explicit public post columns (not `*`): anon's SELECT is column-scoped so it
// can't read private author fields (ai_notes) — and `SELECT *` errors when a
// role lacks a column, so the list must be spelled out. This also trims the
// payload (no embedding / search_tsv / tsvector shipped to the client). Keep in
// sync with the anon column grant in migration 0036.
const POST_SELECT = `
  id, slug, title, excerpt, body, cover_image, cover_alt, trip_id, location, lat, lng,
  published, published_at, view_count, created_at, updated_at, source_locale, i18n, translation_status,
  trip:trips(id, slug, title, summary, cover_image, start_date, end_date, source_locale, i18n),
  photos(*),
  locations(*),
  tracks(*),
  reactions(kind)
`;
// No `comments(count)` here, and it is not an oversight.
//
// PostgREST compiles that shorthand to `count(*)`, which Postgres checks
// against TABLE-level SELECT — column grants do not satisfy it. So the moment
// 0043 column-scoped `comments` to keep visitor_token away from anon, every
// query using POST_SELECT started returning 42501, getPostBySlug returned null,
// and every post page on the site rendered as not-found. Explicit aggregate
// syntax (`comments(id.count())`) is no escape either: PostgREST rejects it
// with PGRST123 unless aggregates are enabled, and they are not.
//
// It cost nothing to lose: `comment_count` was mapped in hydratePost and never
// rendered anywhere. The admin dashboard counts comments through the service
// role, which is unaffected. If a count is ever wanted on a card, it wants a
// maintained column on `posts`, not an aggregate join on every read.

export async function getPublishedPosts(): Promise<PostWithRelations[]> {
  const supabase = getPublicSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    return data.map(hydratePost);
  } catch {
    return [];
  }
}

const SUMMARY_SELECT =
  "id, slug, title, excerpt, location, cover_image, cover_alt, trip_id, published_at, source_locale, i18n";

// Just what the global /map needs: one pin per post + its GPX tracks. Far lighter
// than getPublishedPosts (no photos/body/reactions/comments), so the statically
// rendered /map ships a small payload.
export type MapPost = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  source_locale?: Locale | null;
  i18n?: Partial<Record<Locale, PostTranslation>>;
  locations: GeoPoint[];
  tracks: Track[];
};

const MAP_SELECT =
  "id, slug, title, location, lat, lng, source_locale, i18n, locations(*), tracks(*)";

export async function getMapPosts(
  // Which level of detail to simplify the routes to. The page ships the
  // overview; /api/map/tracks serves the detail tier on zoom. See @/lib/map-lod.
  toleranceM: number = OVERVIEW_TOLERANCE_M,
): Promise<MapPost[]> {
  const supabase = getPublicSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(MAP_SELECT)
      .eq("published", true)
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => ({
      ...row,
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
        // Simplified to whatever tier the caller asked for. The payload did
        // become the problem — 123 KB compressed on eighteen routes, growing
        // with every journey — so this is the zoom-tiered loading the previous
        // comment here promised, rather than giving the 1 m guarantee up.
        //
        // (It once sampled every Nth point down to a fixed 120, which caps the
        // size but bounds no error at all: a hairpin between two samples simply
        // vanished. Douglas–Peucker caps the error instead, which is the part
        // worth keeping.)
        geojson: t.geojson
          ? simplifyTrackGeoJson(t.geojson, {
              horizontalM: toleranceM,
              dropElevation: true,
              stripProperties: true,
            })
          : t.geojson,
      })),
    })) as MapPost[];
  } catch {
    return [];
  }
}

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
/**
 * The trip overview page: cards plus the headline numbers, and nothing else.
 *
 * PostCard is a client component, so every field on the object handed to it is
 * serialized into the page. Passing the full post therefore dragged all GPX
 * geometry into the payload — over a megabyte on a long trip — to render a
 * title, a cover and a date, on a page that draws no map at all. The relations
 * below are fetched only to be counted, and are stripped before the summaries
 * are returned.
 */
export type TripOverview = {
  posts: PostSummary[];
  trackCount: number;
  totalDistanceM: number;
  waypointCount: number;
  geoPhotoCount: number;
};

// distance_m / id / lat / lng only — never `tracks(*)`, whose geojson is the
// whole problem.
const TRIP_OVERVIEW_SELECT = `${SUMMARY_SELECT}, tracks(distance_m), locations(id), photos(lat, lng)`;

export async function getTripOverview(tripId: string): Promise<TripOverview> {
  const empty: TripOverview = {
    posts: [],
    trackCount: 0,
    totalDistanceM: 0,
    waypointCount: 0,
    geoPhotoCount: 0,
  };
  const supabase = getPublicSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(TRIP_OVERVIEW_SELECT)
      .eq("published", true)
      .eq("trip_id", tripId)
      .order("published_at", { ascending: false });
    if (error || !data) return empty;

    const out = { ...empty, posts: [] as PostSummary[] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const row of data as any[]) {
      const { tracks, locations, photos, ...summary } = row;
      const t = tracks ?? [];
      out.trackCount += t.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.totalDistanceM += t.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: number, x: any) => s + (x.distance_m ?? 0),
        0,
      );
      out.waypointCount += (locations ?? []).length;
      out.geoPhotoCount += (photos ?? []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => p.lat != null && p.lng != null,
      ).length;
      out.posts.push(summary as PostSummary);
    }
    return out;
  } catch {
    return empty;
  }
}

/**
 * Thin a post's GPX for map rendering: no drawn point moves more than 0.5 m, so
 * the route still runs down the same side of the same street at any zoom.
 *
 * Only for surfaces that draw lines and nothing else. Post pages must NOT come
 * through here: buildElevationSeries reads these same coordinates, and its
 * smoothing windows are counted in POINTS rather than distance — so dropping
 * any of them changes the ascent the reader sees. Measured on the Skandinavien
 * tracks that is ~16% at a 1 m vertical budget and still ~10% at 0.1 m, i.e.
 * it is the point count itself that matters, not the elevation detail lost.
 */
function withMapGeometry(post: PostWithRelations): PostWithRelations {
  return {
    ...post,
    tracks: post.tracks.map((t) => ({
      ...t,
      geojson: t.geojson
        ? simplifyTrackGeoJson(t.geojson, {
            horizontalM: 1,
            // The journey explorer draws routes, stops and photos — it never
            // reads coords[2]. Shipping elevation there costs bytes for
            // nothing, and once it's gone there is no profile left to protect.
            dropElevation: true,
          })
        : t.geojson,
    })),
  };
}

/** Feeds the journey map only (`/trips/[slug]/map`), which draws no chart. */
export async function getPublishedPostsByTrip(
  tripId: string,
): Promise<PostWithRelations[]> {
  const supabase = getPublicSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select(POST_SELECT)
      .eq("published", true)
      .eq("trip_id", tripId)
      .order("published_at", { ascending: false });
    if (error || !data) return [];
    return data.map(hydratePost).map(withMapGeometry);
  } catch {
    return [];
  }
}

// Prev/next within a trip, in chronological (oldest→newest) reading order, so a
// reader can walk a multi-day trip front-to-back. Light by design — only the
// fields the footer nav needs (slug + the title in both languages), never the
// bodies. `prev` is the earlier post, `next` the later one.
export type PostNavLink = {
  slug: string;
  title: string;
  titleI18n: Partial<Record<Locale, string>>;
};

function toNavLink(
  row:
    | { slug: string; title: string; i18n?: unknown }
    | undefined
    | null,
): PostNavLink | null {
  if (!row) return null;
  const titleI18n: Partial<Record<Locale, string>> = {};
  const i18n = (row.i18n ?? {}) as Partial<Record<Locale, PostTranslation>>;
  for (const loc of ["de", "en"] as Locale[]) {
    const tr = i18n[loc];
    if (tr?.title) titleI18n[loc] = tr.title;
  }
  return { slug: row.slug, title: row.title, titleI18n };
}

export async function getTripPostNav(
  tripId: string,
  currentSlug: string,
): Promise<{ prev: PostNavLink | null; next: PostNavLink | null }> {
  const empty = { prev: null, next: null };
  const supabase = getPublicSupabase();
  try {
    const { data, error } = await supabase
      .from("posts")
      .select("slug, title, i18n, published_at, id")
      .eq("published", true)
      .eq("trip_id", tripId)
      .order("published_at", { ascending: true })
      .order("id", { ascending: true });
    if (error || !data) return empty;
    const idx = data.findIndex((p) => p.slug === currentSlug);
    if (idx === -1) return empty;
    return { prev: toNavLink(data[idx - 1]), next: toNavLink(data[idx + 1]) };
  } catch {
    return empty;
  }
}

export async function getPostBySlug(
  slug: string,
): Promise<PostWithRelations | null> {
  const supabase = getPublicSupabase();
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
  try {
    const { data, error } = await supabase
      .from("trips")
      .select(
        "id, slug, title, summary, cover_image, start_date, end_date, source_locale, i18n",
      )
      .order("start_date", { ascending: false });
    if (error || !data) return [];
    return data as Trip[];
  } catch {
    return [];
  }
}

// Embed the query for the semantic half of hybrid search. Returns null when no
// embeddings provider is configured or the call fails — callers then fall back
// to pure full-text ranking, which the RPCs handle when query_embedding is null.
async function embedQuery(q: string): Promise<number[] | null> {
  const cfg = await getAiConfig();
  if (!cfg.isEmbeddingsConfigured) return null;
  try {
    return await embedText(q, { operation: "search_embed" });
  } catch {
    return null;
  }
}

// Re-fetch full rows by id and restore the fusion ranking the RPC returned (a
// PostgREST `in(...)` filter does not preserve order).
export function orderByIds<T extends { id: string }>(
  rows: T[],
  ids: string[],
): T[] {
  const rank = new Map(ids.map((id, i) => [id, i] as const));
  return [...rows].sort(
    (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
  );
}

// Whether an RPC error means the hybrid-search function simply isn't there (an
// older deployment without the migration) — in which case falling back to plain
// full-text is expected and quiet. Any OTHER error is a real failure worth a log.
export function isMissingFunction(e: unknown): boolean {
  const err = e as { code?: string; message?: string } | null;
  return (
    err?.code === "42883" || // Postgres undefined_function
    err?.code === "PGRST202" || // PostgREST: function not in the schema cache
    /could not find the function|does not exist/i.test(err?.message ?? "")
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

// Keep only the i18n fields the photo map actually renders — the photo CAPTION
// and the post TITLE. The raw `i18n`/post `i18n` also carry the translated
// excerpt/location and the entire translated BODY, which would otherwise ship
// (per photo, duplicated across each post's photos) and bloat the static map
// payload to several MB.
function trimCaptionI18n(
  i18n: unknown,
): Partial<Record<Locale, PhotoTranslation>> | undefined {
  const src = (i18n ?? {}) as Partial<Record<Locale, PhotoTranslation>>;
  const out: Partial<Record<Locale, PhotoTranslation>> = {};
  for (const loc of LOCALES) {
    const c = src[loc]?.caption;
    if (c) out[loc] = { caption: c };
  }
  return Object.keys(out).length ? out : undefined;
}
function trimTitleI18n(
  i18n: unknown,
): Partial<Record<Locale, PostTranslation>> | undefined {
  const src = (i18n ?? {}) as Partial<Record<Locale, PostTranslation>>;
  const out: Partial<Record<Locale, PostTranslation>> = {};
  for (const loc of LOCALES) {
    const title = src[loc]?.title;
    if (title) out[loc] = { title };
  }
  return Object.keys(out).length ? out : undefined;
}

// Every geotagged photo across published posts, for the global photo map.
export async function getGeotaggedPhotos(): Promise<GeoPhoto[]> {
  const supabase = getPublicSupabase();
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
    if (error || !data) return [];
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
          i18n: trimCaptionI18n(r.i18n),
          postI18n: trimTitleI18n(post.i18n),
        },
      ];
    });
  } catch {
    return [];
  }
}

// Search returns lightweight summaries (card columns only) — not full posts with
// photos/body — so the result payload stays small. `embedding` may be passed
// precomputed so a combined search embeds the query once (see `searchAll`);
// omit it and the query is embedded here.
// Cosine-distance ceilings for the vector half of hybrid search: drop results
// that aren't semantically near the query (otherwise the vector side returned
// every embedded row, so any query — even nonsense — matched everything).
//
// Posts are matched at the CHUNK level (search_posts_hybrid scores a post by its
// nearest chunk). Specific queries land at 0.4–0.6, conceptual ones at ~0.55–0.62,
// and nonsense floors at ~0.76. We keep this ceiling fairly TIGHT (0.65) so a
// broad conceptual query doesn't pull in every post via mid-distance chunks —
// vocabulary recall (e.g. "Fahrrad" → posts that say "Rad"/"bike") is handled by
// synonym-expanded full-text instead (see search-expand.ts), not by loosening
// the semantic ceiling. Photos aren't chunked (short captions already embed
// close), separating at relevant 0.55–0.80 / nonsense 0.85+, so they take a
// looser ceiling. Calibrated against a relevant/synonym/cross-language/nonsense
// term set.
const POST_MAX_DISTANCE = 0.65;
const PHOTO_MAX_DISTANCE = 0.8;

// Result caps. This content is thematically uniform (travel/nature), so a broad
// query ("Berge", "Gletscher") is semantically near most of it — distance can't
// separate "specific" from "matches-everything". Cap to the top-N best-ranked so
// broad queries show their most-relevant matches, not the whole library.
const POST_MATCH_COUNT = 12;
const PHOTO_MATCH_COUNT = 12;

type PublicSupabase = ReturnType<typeof getPublicSupabase>;

// The shape both hybrid searches share: embed the query → rank ids via the
// hybrid RPC → refetch the display rows for those ids → restore the RPC's order.
// `refetch` returns null on a DB error (→ []); `fallback` runs when the RPC path
// throws — quietly when the function is merely absent (see isMissingFunction),
// with a log otherwise, so a real failure is never silently "no results". Search
// never throws to the caller.
async function hybridSearch<T extends { id: string }>(opts: {
  q: string;
  embedding: number[] | null | undefined;
  rpc: "search_posts_hybrid" | "search_photos_hybrid";
  matchCount: number;
  maxDistance: number;
  refetch: (supabase: PublicSupabase, ids: string[]) => Promise<T[] | null>;
  fallback: (supabase: PublicSupabase) => Promise<T[]>;
}): Promise<T[]> {
  const supabase = getPublicSupabase();
  try {
    const emb =
      opts.embedding !== undefined ? opts.embedding : await embedQuery(opts.q);
    const { data: ranked, error } = await supabase.rpc(opts.rpc, {
      query_text: opts.q,
      query_embedding: emb ? toVectorLiteral(emb) : null,
      match_count: opts.matchCount,
      max_distance: opts.maxDistance,
      ts_query: buildExpandedTsQuery(opts.q),
    });
    if (error) throw error;
    const ids = ((ranked ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return [];
    const rows = await opts.refetch(supabase, ids);
    if (!rows) return [];
    return orderByIds(rows, ids);
  } catch (e) {
    if (!isMissingFunction(e))
      console.error(
        `[search] ${opts.rpc} failed:`,
        e instanceof Error ? e.message : e,
      );
    try {
      return await opts.fallback(supabase);
    } catch {
      return [];
    }
  }
}

export async function searchPosts(
  query: string,
  embedding?: number[] | null,
): Promise<PostSummary[]> {
  const q = query.trim();
  if (!q) return [];
  return hybridSearch<PostSummary>({
    q,
    embedding,
    rpc: "search_posts_hybrid",
    matchCount: POST_MATCH_COUNT,
    maxDistance: POST_MAX_DISTANCE,
    refetch: async (supabase, ids) => {
      const { data, error } = await supabase
        .from("posts")
        .select(SUMMARY_SELECT)
        .eq("published", true)
        .in("id", ids);
      return error ? null : (data as PostSummary[] | null);
    },
    // RPC/migration not present (older deployments): plain full-text search.
    fallback: async (supabase) => {
      const { data, error } = await supabase
        .from("posts")
        .select(SUMMARY_SELECT)
        .eq("published", true)
        .textSearch("search_tsv", q, { type: "websearch", config: "simple" })
        .limit(50);
      return error || !data ? [] : (data as PostSummary[]);
    },
  });
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
  embedding?: number[] | null,
): Promise<PhotoSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  return hybridSearch<PhotoSearchResult>({
    q,
    embedding,
    rpc: "search_photos_hybrid",
    matchCount: PHOTO_MATCH_COUNT,
    maxDistance: PHOTO_MAX_DISTANCE,
    refetch: async (supabase, ids) => {
      const { data, error } = await supabase
        .from("photos")
        .select(PHOTO_SEARCH_SELECT)
        .eq("media_type", "image")
        .in("id", ids);
      return error || !data ? null : data.map(hydratePhotoResult);
    },
    // No older-deployment full-text fallback for photos — just no results.
    fallback: async () => [],
  });
}

// Combined hybrid search over stories AND photos. Embeds the query ONCE and
// shares the vector with both RPCs (previously each path embedded separately),
// then runs them in parallel. Returns light summaries for a small payload.
export async function searchAll(
  query: string,
): Promise<{ posts: PostSummary[]; photos: PhotoSearchResult[] }> {
  const q = query.trim();
  if (!q) return { posts: [], photos: [] };
  // Embed once and share the vector with both searches. `embedQuery` returns null
  // when no embeddings provider is configured — the RPCs then rank by full-text.
  const embedding = await embedQuery(q);
  const [posts, rawPhotos] = await Promise.all([
    searchPosts(q, embedding),
    searchPhotos(q, embedding),
  ]);
  const photos = rawPhotos.map((ph) => ({
    ...ph,
    // Keep only the parent post's title (drop the translated excerpt/body that
    // would otherwise bloat the payload) — same trimming as the photo map.
    post_i18n: trimTitleI18n(ph.post_i18n),
    // The card shows caption || place_name as its label; the AI description is a
    // long paragraph that's almost never the chosen label — don't ship it.
    ai_description: null,
  }));
  return { posts, photos };
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
