import { describe, it, expect, vi } from "vitest";

// A post's `i18n` column holds the COMPLETE translated article in both
// languages — `body` included. PostCard is a client component, so everything
// handed to it is serialized into the page: the archive shipped two full copies
// of every published article in order to render a grid of titles and cover
// images.
//
// The trip overview already learned this once and fixed it by dropping
// `tracks(*)`; its doc comment describes the exact mechanism. The summary
// overlay was the other half, and it was never trimmed.
//
// `localizePostSummary` overlays title, excerpt and location and never reads
// `body`, so those three are the whole requirement.

const supa = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("@/lib/supabase/public", () => ({
  getPublicSupabase: () => {
    const q: Record<string, unknown> = {};
    const chain = () => q;
    Object.assign(q, {
      from: chain,
      select: chain,
      eq: chain,
      in: chain,
      order: chain,
      textSearch: chain,
      limit: chain,
      range: () => Promise.resolve({ data: supa.rows, error: null, count: supa.rows.length }),
    });
    return q;
  },
}));

import { getPostSummaries } from "@/lib/content";

const GERMAN_ARTICLE = "Es war ein langer Tag am Berg. ".repeat(150); // ~4.6k chars

function row(id: string) {
  return {
    id,
    slug: `post-${id}`,
    title: "On the Walberla at sunrise",
    excerpt: "Four in the morning, a hill, and a sea of fog.",
    location: "Walberla",
    published: true,
    source_locale: "en",
    i18n: {
      de: {
        title: "Auf dem Walberla bei Sonnenaufgang",
        excerpt: "Vier Uhr morgens, ein Berg, ein Nebelmeer.",
        location: "Walberla",
        body: GERMAN_ARTICLE,
      },
      en: {
        title: "On the Walberla at sunrise",
        excerpt: "Four in the morning, a hill, and a sea of fog.",
        location: "Walberla",
        body: GERMAN_ARTICLE,
      },
    },
  };
}

describe("post summaries carry only the overlay they render", () => {
  it("drops the translated body from every locale", async () => {
    supa.rows = [row("a")];
    const { posts } = await getPostSummaries({ limit: 10 });
    expect(posts).toHaveLength(1);
    const i18n = posts[0].i18n as Record<string, Record<string, unknown>>;
    expect(i18n.de).toBeTruthy();
    expect(i18n.de.body).toBeUndefined();
    expect(i18n.en.body).toBeUndefined();
  });

  it("keeps the three fields localizePostSummary actually overlays", async () => {
    // Trimming too hard is the other way to get this wrong: a German reader
    // would silently fall back to English titles on every card.
    supa.rows = [row("a")];
    const { posts } = await getPostSummaries({ limit: 10 });
    const de = (posts[0].i18n as Record<string, Record<string, unknown>>).de;
    expect(de.title).toBe("Auf dem Walberla bei Sonnenaufgang");
    expect(de.excerpt).toBe("Vier Uhr morgens, ein Berg, ein Nebelmeer.");
    expect(de.location).toBe("Walberla");
  });

  it("measurably shrinks what gets serialized", async () => {
    // The point of the change, asserted as a number rather than a shape.
    supa.rows = Array.from({ length: 20 }, (_, i) => row(String(i)));
    const before = JSON.stringify(supa.rows).length;
    const { posts } = await getPostSummaries({ limit: 20 });
    const after = JSON.stringify(posts).length;
    expect(after).toBeLessThan(before / 4);
  });

  it("leaves a post with no translations alone", async () => {
    supa.rows = [{ ...row("a"), i18n: null }];
    const { posts } = await getPostSummaries({ limit: 10 });
    expect(posts[0].i18n).toBeUndefined();
  });

  it("keeps a locale that has only a title", async () => {
    // Partial translations are normal while a run is in flight.
    supa.rows = [{ ...row("a"), i18n: { de: { title: "Nur der Titel" } } }];
    const { posts } = await getPostSummaries({ limit: 10 });
    const i18n = posts[0].i18n as Record<string, Record<string, unknown>>;
    expect(i18n.de.title).toBe("Nur der Titel");
    expect(i18n.en).toBeUndefined();
  });
});
