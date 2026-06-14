// Read-time content localization (pure — safe on server and client).
//
// Translations live in each row's `i18n` column, keyed by locale and holding
// ONLY the non-source locale(s). So localizing is just "overlay the translated
// fields for this locale, if present, over the source row." Any field the
// translator left empty falls back to the source value.
import type { Locale } from "@/lib/i18n";
import type {
  Interaction,
  Photo,
  Post,
  PostSummary,
  PostWithRelations,
  Trip,
} from "@/lib/types";

function merge<T extends object>(base: T, tr: Partial<T> | undefined): T {
  if (!tr) return base;
  const patch: Partial<T> = {};
  for (const key of Object.keys(tr) as (keyof T)[]) {
    const v = tr[key];
    if (v !== undefined && v !== null) patch[key] = v;
  }
  return { ...base, ...patch };
}

export function localizePost<T extends Post>(post: T, locale: Locale): T {
  return merge(post, post.i18n?.[locale] as Partial<T> | undefined);
}

export function localizeTrip<T extends Trip>(trip: T, locale: Locale): T {
  return merge(trip, trip.i18n?.[locale] as Partial<T> | undefined);
}

// Card listings carry only title + excerpt translations.
export function localizePostSummary(s: PostSummary, locale: Locale): PostSummary {
  const tr = s.i18n?.[locale];
  if (!tr) return s;
  return {
    ...s,
    title: tr.title ?? s.title,
    excerpt: tr.excerpt ?? s.excerpt,
  };
}

export function localizePhoto(photo: Photo, locale: Locale): Photo {
  return merge(photo, photo.i18n?.[locale] as Partial<Photo> | undefined);
}

export function localizeInteraction(
  it: Interaction,
  locale: Locale,
): Interaction {
  return merge(it, it.i18n?.[locale] as Partial<Interaction> | undefined);
}

// A full post with its nested photos and trip localized too, so inline photo
// captions, the trailing gallery, and the trip chip all read in one language.
export function localizePostDeep(
  post: PostWithRelations,
  locale: Locale,
): PostWithRelations {
  const localized = localizePost(post, locale);
  return {
    ...localized,
    photos: localized.photos.map((p) => localizePhoto(p, locale)),
    trip: localized.trip ? localizeTrip(localized.trip, locale) : null,
  };
}
