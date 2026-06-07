// Covers the data-layer mapping logic (hydratePost / summarizeReactions /
// hydrateComment) by pointing the content module at a faked Supabase backend.
import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

const fake = makeFakeSupabase({
  posts: [
    {
      id: "p1",
      slug: "a-post",
      title: "A Post",
      published: true,
      published_at: "2026-06-01",
      trip: { id: "t1", slug: "trip", title: "Trip" },
      photos: [
        { id: "ph2", sort_order: 1, url: "u2" },
        { id: "ph1", sort_order: 0, url: "u1" },
      ],
      locations: [
        { id: "l2", sort_order: 1 },
        { id: "l1", sort_order: 0 },
      ],
      tracks: [{ id: "tr1", name: "Day 1", distance_m: 1000, geojson: {} }],
      reactions: [{ kind: "heart" }, { kind: "heart" }, { kind: "fire" }],
      comments: [{ count: 3 }],
    },
  ],
  comments: [
    {
      id: "c1",
      post_id: "p1",
      parent_id: null,
      author_name: "Ann",
      body: "first",
      created_at: "2026-06-01T10:00:00Z",
      hidden: false,
      comment_likes: [{ count: 2 }],
    },
    {
      id: "c2",
      post_id: "p1",
      parent_id: null,
      author_name: "Bob",
      body: "second",
      created_at: "2026-06-02T10:00:00Z",
      hidden: false,
      comment_likes: [],
    },
  ],
  interactions: [
    {
      id: "i1",
      post_id: "p1",
      kind: "poll",
      question: "Q",
      options: ["a", "b"],
      sort_order: 0,
    },
  ],
});

vi.mock("@/lib/supabase/public", () => ({ getPublicSupabase: () => fake }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => fake }));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => fake }));

import {
  getPublishedPosts,
  getComments,
  getInteractions,
  hydrateComment,
} from "@/lib/content";

describe("content layer (faked backend)", () => {
  it("hydrates a post: sorts photos, summarizes reactions, counts comments", async () => {
    const [post] = await getPublishedPosts();
    expect(post.photos.map((p) => p.id)).toEqual(["ph1", "ph2"]); // by sort_order
    expect(post.reactions).toEqual({ heart: 2, fire: 1, wow: 0, star: 0 });
    expect(post.comment_count).toBe(3);
    expect(post.trip?.id).toBe("t1");
    expect(post.tracks[0]).toMatchObject({ name: "Day 1", distance_m: 1000 });
  });

  it("returns comments oldest-first with like counts", async () => {
    const comments = await getComments("p1");
    expect(comments.map((c) => c.id)).toEqual(["c1", "c2"]); // reversed to ascending
    expect(comments[0].like_count).toBe(2);
    expect(comments[1].like_count).toBe(0);
  });

  it("hydrateComment reads the nested like count", () => {
    expect(
      hydrateComment({ id: "x", comment_likes: [{ count: 7 }] }).like_count,
    ).toBe(7);
    expect(hydrateComment({ id: "y" }).like_count).toBe(0);
  });

  it("returns public-safe interactions via the admin client", async () => {
    const list = await getInteractions("p1");
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ kind: "poll", question: "Q" });
  });
});
