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

export type Photo = {
  id: string;
  url: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  lat: number | null;
  lng: number | null;
  sort_order: number;
};

export type Comment = {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
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
  reactions: ReactionSummary;
  comment_count: number;
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
