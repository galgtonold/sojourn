// Domain types shared across server and client.

export type Trip = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_image: string | null;
  start_date: string | null;
  end_date: string | null;
};

export type GeoPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  day: number | null;
  sort_order: number;
};

export type Track = {
  id: string;
  name: string | null;
  distance_m: number | null;
  // Earliest/latest GPX trackpoint <time>, when the source GPX carried them.
  started_at?: string | null;
  ended_at?: string | null;
  // Parsed GPX as a GeoJSON FeatureCollection of LineStrings.
  geojson: GeoJSON.FeatureCollection<GeoJSON.LineString>;
};

export type Photo = {
  id: string;
  url: string | null;
  caption: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  lat: number | null;
  lng: number | null;
  taken_at?: string | null;
  sort_order: number;
};

// A photo surfaced by search, carrying just enough of its parent post to render
// a card and link back to the story it belongs to.
export type PhotoSearchResult = {
  id: string;
  url: string | null;
  caption: string | null;
  alt: string | null;
  ai_description: string | null;
  place_name: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  lat: number | null;
  lng: number | null;
  post_slug: string;
  post_title: string;
};

export type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
  like_count: number;
};

export type ReactionKind = "heart" | "fire" | "wow" | "star";

export type ReactionSummary = Record<ReactionKind, number>;

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string | null;
  cover_image: string | null;
  cover_alt: string | null;
  trip_id: string | null;
  location: string | null;
  lat: number | null;
  lng: number | null;
  published: boolean;
  published_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type PostWithRelations = Post & {
  trip: Trip | null;
  photos: Photo[];
  locations: GeoPoint[];
  tracks: Track[];
  reactions: ReactionSummary;
  comment_count: number;
};

// Public-safe shape for an inline interactive block (no correct answer).
export type Interaction = {
  id: string;
  kind: "poll" | "quiz";
  question: string;
  options: string[];
  sort_order: number;
};

// Lightweight shape for listings (no heavy joins) — keeps list pages scalable.
export type PostSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  location: string | null;
  cover_image: string | null;
  cover_alt: string | null;
  trip_id: string | null;
  published_at: string | null;
};

export const REACTION_KINDS: ReactionKind[] = ["heart", "fire", "wow", "star"];

export const REACTION_EMOJI: Record<ReactionKind, string> = {
  heart: "❤️",
  fire: "🔥",
  wow: "😮",
  star: "⭐",
};

export function emptyReactions(): ReactionSummary {
  return { heart: 0, fire: 0, wow: 0, star: 0 };
}
