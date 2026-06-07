// Exercises the data-access layer's graceful degradation: with Supabase
// unconfigured (the default test env), every reader falls back to bundled demo
// content. No mocks needed.
import { describe, it, expect } from "vitest";
import {
  DEMO_MODE,
  getPublishedPosts,
  getPostSummaries,
  getPublishedPostsByTrip,
  getPostBySlug,
  getTrips,
  getGeotaggedPhotos,
  searchPosts,
  searchPhotos,
  getComments,
  getInteractions,
  getPostForPreview,
} from "@/lib/content";
import { demoPosts, demoTrips } from "@/lib/demo";

describe("content layer (demo fallback)", () => {
  it("is in demo mode when Supabase is unconfigured", () => {
    expect(DEMO_MODE).toBe(true);
  });

  it("getPublishedPosts returns the demo posts", async () => {
    const posts = await getPublishedPosts();
    expect(posts).toEqual(demoPosts);
  });

  it("getTrips returns the demo trips", async () => {
    expect(await getTrips()).toEqual(demoTrips);
  });

  it("getPostBySlug finds a known post and returns null otherwise", async () => {
    const slug = demoPosts[0].slug;
    expect((await getPostBySlug(slug))?.slug).toBe(slug);
    expect(await getPostBySlug("does-not-exist")).toBeNull();
  });

  it("getPostSummaries paginates and filters by trip", async () => {
    const page = await getPostSummaries({ limit: 1, offset: 0 });
    expect(page.total).toBe(demoPosts.length);
    expect(page.posts).toHaveLength(1);

    const tripId = demoPosts[0].trip_id!;
    const byTrip = await getPostSummaries({ tripId });
    expect(byTrip.posts.every((p) => p.trip_id === tripId)).toBe(true);
  });

  it("getPublishedPostsByTrip filters by trip id", async () => {
    const tripId = demoPosts[0].trip_id!;
    const posts = await getPublishedPostsByTrip(tripId);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((p) => p.trip_id === tripId)).toBe(true);
  });

  it("searchPosts matches title/excerpt and returns [] for empty query", async () => {
    expect(await searchPosts("   ")).toEqual([]);
    const needle = demoPosts[0].title.split(" ")[0];
    const hits = await searchPosts(needle);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("searchPhotos matches photo captions and links to the parent post", async () => {
    expect(await searchPhotos("   ")).toEqual([]);

    // "First light on the spires" is a demo photo caption on post-fitzroy.
    const hits = await searchPhotos("first light");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].post_slug).toBe(demoPosts[0].slug);
    expect(hits[0].caption?.toLowerCase()).toContain("first light");
  });

  it("searchPhotos also matches via the parent post's location/title", async () => {
    const hits = await searchPhotos("Argentina");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.post_slug && h.post_title)).toBe(true);
  });

  it("getComments returns only the matching post's demo comments", async () => {
    const withComments = await getComments("post-fitzroy");
    expect(withComments.length).toBeGreaterThan(0);
    expect(withComments.every((c) => c.post_id === "post-fitzroy")).toBe(true);
    expect(await getComments("no-such-post")).toEqual([]);
  });

  it("getGeotaggedPhotos returns only geotagged photos of published posts", async () => {
    const photos = await getGeotaggedPhotos();
    expect(photos.length).toBeGreaterThan(0);
    // Every result is fully geotagged, has an image, and links to a real post.
    const slugs = new Set(demoPosts.filter((p) => p.published).map((p) => p.slug));
    for (const ph of photos) {
      expect(Number.isFinite(ph.lat)).toBe(true);
      expect(Number.isFinite(ph.lng)).toBe(true);
      expect(ph.url).toBeTruthy();
      expect(slugs.has(ph.postSlug)).toBe(true);
    }
    // It must not invent photos that lack coordinates.
    const expected = demoPosts
      .filter((p) => p.published)
      .flatMap((p) => p.photos.filter((ph) => ph.lat != null && ph.lng != null && ph.url));
    expect(photos.length).toBe(expected.length);
  });

  it("getInteractions and getPostForPreview no-op without a backend", async () => {
    expect(await getInteractions(demoPosts[0].id)).toEqual([]);
    expect(await getPostForPreview(demoPosts[0].id)).toBeNull();
  });
});
