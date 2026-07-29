import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/public", () => ({ getPublicSupabase: () => sb.client }));

import { getTripOverview } from "@/lib/content";

const post = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  slug: "day-one",
  title: "Day one",
  excerpt: null,
  location: null,
  cover_image: null,
  cover_alt: null,
  trip_id: "t1",
  published: true,
  published_at: "2026-07-01",
  source_locale: "de",
  i18n: {},
  tracks: [{ distance_m: 12_000 }, { distance_m: 8_000 }],
  locations: [{ id: "l1" }, { id: "l2" }, { id: "l3" }],
  photos: [
    { lat: 59.1, lng: 10.2 },
    { lat: null, lng: null },
  ],
  ...over,
});

beforeEach(() => {
  sb.client = makeFakeSupabase({ posts: [post()] });
});

describe("getTripOverview", () => {
  // The reason this function exists: PostCard is a client component, so every
  // field on the object handed to it is serialized into the page. Shipping the
  // full post dragged all GPX geometry along — over a megabyte on a long trip —
  // to render a title, a cover and a date.
  it("hands the cards no geometry, photos or waypoints", async () => {
    const { posts } = await getTripOverview("t1");
    expect(posts).toHaveLength(1);
    expect(posts[0]).not.toHaveProperty("tracks");
    expect(posts[0]).not.toHaveProperty("photos");
    expect(posts[0]).not.toHaveProperty("locations");
    expect(posts[0]).not.toHaveProperty("body");
  });

  it("keeps everything a card actually renders", async () => {
    const { posts } = await getTripOverview("t1");
    expect(posts[0]).toMatchObject({
      id: "p1",
      slug: "day-one",
      title: "Day one",
      trip_id: "t1",
      published_at: "2026-07-01",
    });
  });

  it("still totals the stats the page shows", async () => {
    const o = await getTripOverview("t1");
    expect(o.totalDistanceM).toBe(20_000);
    expect(o.trackCount).toBe(2);
    expect(o.waypointCount).toBe(3);
    // Only geotagged photos count — they are what the map could plot.
    expect(o.geoPhotoCount).toBe(1);
  });

  it("sums across every post in the trip", async () => {
    sb.client = makeFakeSupabase({
      posts: [post(), post({ id: "p2", slug: "day-two" })],
    });
    const o = await getTripOverview("t1");
    expect(o.posts).toHaveLength(2);
    expect(o.totalDistanceM).toBe(40_000);
    expect(o.waypointCount).toBe(6);
  });

  it("copes with a post that has no relations at all", async () => {
    sb.client = makeFakeSupabase({
      posts: [post({ tracks: undefined, locations: undefined, photos: undefined })],
    });
    const o = await getTripOverview("t1");
    expect(o.totalDistanceM).toBe(0);
    expect(o.waypointCount).toBe(0);
    expect(o.geoPhotoCount).toBe(0);
    expect(o.posts).toHaveLength(1);
  });
});
