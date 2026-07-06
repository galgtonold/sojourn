// Domain types shared across server and client.
import type { Locale } from "@/lib/i18n";

// Machine-translation bookkeeping. `i18n` holds translated fields keyed by
// locale, carrying ONLY the non-source locale(s); read-time overlay is
// `i18n[locale] ?? base` (see lib/i18n-content.ts).
export type TranslationStatus = "none" | "pending" | "ready" | "error";
export type PostTranslation = {
  title?: string;
  excerpt?: string | null;
  location?: string | null;
  body?: string | null;
};
export type TripTranslation = { title?: string; summary?: string | null };
export type PhotoTranslation = { caption?: string | null; alt?: string | null };
export type InteractionTranslation = {
  question?: string;
  options?: string[];
  explanation?: string | null;
};

export type Trip = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  cover_image: string | null;
  start_date: string | null;
  end_date: string | null;
  source_locale?: Locale | null;
  i18n?: Partial<Record<Locale, TripTranslation>>;
  translation_status?: TranslationStatus;
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
  media_type?: "image" | "video";
  poster_url?: string | null;
  lat: number | null;
  lng: number | null;
  taken_at?: string | null;
  // Minutes offset of the capture-time zone (EXIF OffsetTimeOriginal). taken_at
  // holds the naive local wall-clock labelled UTC, so true UTC = taken_at minus
  // this offset — needed to line photos up against GPX track times (real UTC).
  taken_at_offset_min?: number | null;
  created_at?: string | null;
  sort_order: number;
  i18n?: Partial<Record<Locale, PhotoTranslation>>;
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
  i18n?: Partial<Record<Locale, PhotoTranslation>>;
  post_i18n?: Partial<Record<Locale, PostTranslation>>;
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
  source_locale?: Locale | null;
  i18n?: Partial<Record<Locale, PostTranslation>>;
  translation_status?: TranslationStatus;
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
  i18n?: Partial<Record<Locale, InteractionTranslation>>;
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
  source_locale?: Locale | null;
  i18n?: Partial<Record<Locale, PostTranslation>>;
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
