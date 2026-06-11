import { describe, expect, it } from "vitest";
import {
  localizeInteraction,
  localizePost,
  localizePostDeep,
} from "@/lib/i18n-content";
import type { Interaction, Post, PostWithRelations } from "@/lib/types";

// A German-authored post with an English translation in i18n.en.
const post = {
  id: "p1",
  slug: "tag-eins",
  title: "Tag eins",
  excerpt: "Ankunft in Bergen",
  body: "Wir kamen bei Regen an. [photo:1]",
  cover_image: null,
  cover_alt: null,
  trip_id: null,
  location: "Bergen",
  lat: null,
  lng: null,
  published: true,
  published_at: null,
  view_count: 0,
  created_at: "",
  updated_at: "",
  source_locale: "de",
  i18n: {
    en: {
      title: "Day one",
      excerpt: "Arrival in Bergen",
      body: "We arrived in the rain. [photo:1]",
    },
  },
} as Post;

describe("localizePost", () => {
  it("overlays the requested locale's fields", () => {
    const en = localizePost(post, "en");
    expect(en.title).toBe("Day one");
    expect(en.body).toBe("We arrived in the rain. [photo:1]");
  });

  it("returns the source untouched for the source locale", () => {
    const de = localizePost(post, "de");
    expect(de.title).toBe("Tag eins");
    expect(de).toBe(post); // no translation for `de` → same object
  });

  it("falls back per-field when a translated field is missing", () => {
    const partial = {
      ...post,
      i18n: { en: { title: "Day one" } },
    } as Post;
    const en = localizePost(partial, "en");
    expect(en.title).toBe("Day one"); // translated
    expect(en.excerpt).toBe("Ankunft in Bergen"); // falls back to source
  });
});

describe("localizeInteraction", () => {
  it("overlays question and options, preserving order", () => {
    const it_: Interaction = {
      id: "q1",
      kind: "poll",
      question: "Lieblingsfjord?",
      options: ["Nærøyfjord", "Geirangerfjord"],
      sort_order: 0,
      i18n: {
        en: {
          question: "Favourite fjord?",
          options: ["Nærøyfjord", "Geirangerfjord"],
        },
      },
    };
    const en = localizeInteraction(it_, "en");
    expect(en.question).toBe("Favourite fjord?");
    expect(en.options).toEqual(["Nærøyfjord", "Geirangerfjord"]);
  });
});

describe("localizePostDeep", () => {
  it("localizes nested photo captions too", () => {
    const deep = {
      ...post,
      trip: null,
      photos: [
        {
          id: "ph1",
          url: null,
          caption: "Hafen",
          alt: null,
          width: null,
          height: null,
          blurhash: null,
          lat: null,
          lng: null,
          sort_order: 0,
          i18n: { en: { caption: "Harbour" } },
        },
      ],
      locations: [],
      tracks: [],
      reactions: { heart: 0, fire: 0, wow: 0, star: 0 },
      comment_count: 0,
    } as PostWithRelations;
    const en = localizePostDeep(deep, "en");
    expect(en.title).toBe("Day one");
    expect(en.photos[0].caption).toBe("Harbour");
  });
});
