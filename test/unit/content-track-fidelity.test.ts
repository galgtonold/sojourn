import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/public", () => ({ getPublicSupabase: () => sb.client }));

import { getPublishedPostsByTrip, getPostBySlug } from "@/lib/content";

// A dead-straight climb: horizontally redundant, so the journey map can drop
// almost all of it — and exactly the shape a 2D-only simplifier would flatten.
const M = 1 / 111_320;
const COORDS = Array.from({ length: 400 }, (_, i) => [i * 5 * M, 0, i * 0.02]);

const row = () => ({
  id: "p1",
  slug: "day-one",
  title: "Day one",
  published: true,
  trip_id: "t1",
  photos: [],
  locations: [],
  reactions: [],
  tracks: [
    {
      id: "tr1",
      name: "day one",
      distance_m: 2000,
      geojson: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: COORDS } },
        ],
      },
    },
  ],
});

const pointsOf = (post: { tracks: { geojson: unknown }[] }) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ((post.tracks[0].geojson as any).features[0].geometry.coordinates as number[][]).length;

beforeEach(() => {
  sb.client = makeFakeSupabase({ posts: [row()] });
});

describe("track geometry per surface", () => {
  it("thins geometry for the journey map, which draws lines and no chart", async () => {
    const posts = await getPublishedPostsByTrip("t1");
    expect(posts).toHaveLength(1);
    expect(pointsOf(posts[0])).toBeLessThan(COORDS.length / 4);
  });

  /**
   * The guard that matters. buildElevationSeries reads these same coordinates,
   * and its smoothing windows are counted in POINTS — so dropping any of them
   * shifts the ascent the reader sees (measured on real tracks: ~10% even with
   * a 0.1 m vertical budget, ~16% at 1 m). Post pages must keep every point.
   */
  it("leaves post pages at full resolution, so the elevation chart is unchanged", async () => {
    const post = await getPostBySlug("day-one");
    expect(post).not.toBeNull();
    expect(pointsOf(post!)).toBe(COORDS.length);
  });

  it("keeps elevation on the points the journey map retains", async () => {
    const posts = await getPublishedPostsByTrip("t1");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const coords = (posts[0].tracks[0].geojson as any).features[0].geometry
      .coordinates as number[][];
    expect(coords.every((c) => c.length === 3)).toBe(true);
    expect(coords[coords.length - 1][2]).toBeCloseTo(COORDS[COORDS.length - 1][2], 1);
  });
});
