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

// Translation bookkeeping that must NOT survive localization: once a row is
// localized these are consumed, and leaving them on the object would serialize
// the OTHER language's text into any client component the row is passed to.
const BOOKKEEPING = ["i18n", "source_locale", "translation_status"];

function merge<T extends object>(base: T, tr: Partial<T> | undefined): T {
  const out = { ...base } as Record<string, unknown>;
  if (tr) {
    for (const [key, v] of Object.entries(tr)) {
      if (v !== undefined && v !== null) out[key] = v;
    }
  }
  for (const key of BOOKKEEPING) delete out[key];
  return out as T;
}

export function localizePost<T extends Post>(post: T, locale: Locale): T {
  return merge(post, post.i18n?.[locale] as Partial<T> | undefined);
}

export function localizeTrip<T extends Trip>(trip: T, locale: Locale): T {
  return merge(trip, trip.i18n?.[locale] as Partial<T> | undefined);
}

// Card listings carry only title + excerpt translations. Strips the i18n
// bookkeeping so card grids don't ship the other language to the client.
export function localizePostSummary(s: PostSummary, locale: Locale): PostSummary {
  const tr = s.i18n?.[locale];
  const out = {
    ...s,
    title: tr?.title ?? s.title,
    excerpt: tr?.excerpt ?? s.excerpt,
    location: tr?.location ?? s.location,
  };
  delete out.i18n;
  delete out.source_locale;
  return out;
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
