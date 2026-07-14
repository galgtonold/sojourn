import { describe, it, expect } from "vitest";
import { collectSubtree, groupByPost, childrenOf } from "@/lib/comment-tree";

describe("collectSubtree", () => {
  // a ─ b ─ d
  //   └ c
  // e (separate root)
  const rows = [
    { id: "a", parent_id: null },
    { id: "b", parent_id: "a" },
    { id: "c", parent_id: "a" },
    { id: "d", parent_id: "b" },
    { id: "e", parent_id: null },
  ];

  it("collects a root plus all its descendants", () => {
    expect([...collectSubtree(rows, "a")].sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("collects a mid-tree node and its descendants only", () => {
    expect([...collectSubtree(rows, "b")].sort()).toEqual(["b", "d"]);
  });

  it("returns just the id for a leaf", () => {
    expect([...collectSubtree(rows, "d")]).toEqual(["d"]);
  });

  it("does not pull in an unrelated root", () => {
    expect(collectSubtree(rows, "a").has("e")).toBe(false);
  });

  it("terminates on a parent cycle instead of looping forever", () => {
    const cyclic = [
      { id: "x", parent_id: "y" },
      { id: "y", parent_id: "x" },
    ];
    expect([...collectSubtree(cyclic, "x")].sort()).toEqual(["x", "y"]);
  });
});

describe("groupByPost", () => {
  const row = (
    id: string,
    post_slug: string,
    created_at: string,
    post_title = post_slug.toUpperCase(),
  ) => ({ id, post_slug, post_title, created_at });

  it("groups rows by post_slug carrying title + slug", () => {
    const groups = groupByPost([
      row("1", "alps", "2026-07-01T00:00:00Z"),
      row("2", "alps", "2026-07-02T00:00:00Z"),
      row("3", "kyoto", "2026-07-03T00:00:00Z"),
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["kyoto", "alps"]);
    const alps = groups.find((g) => g.slug === "alps")!;
    expect(alps.title).toBe("ALPS");
    expect(alps.rows.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("orders posts by their most recent comment, newest first", () => {
    const groups = groupByPost([
      row("old", "a", "2026-01-01T00:00:00Z"),
      row("mid", "b", "2026-06-01T00:00:00Z"),
      row("new", "c", "2026-12-01T00:00:00Z"),
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["c", "b", "a"]);
  });

  it("ranks a post by its latest comment, not its first", () => {
    // Post 'a' has both the oldest and the newest comment → it should rank
    // first on the strength of the newest.
    const groups = groupByPost([
      row("a-old", "a", "2026-01-01T00:00:00Z"),
      row("b", "b", "2026-06-01T00:00:00Z"),
      row("a-new", "a", "2026-12-01T00:00:00Z"),
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["a", "b"]);
  });
});

describe("childrenOf", () => {
  const row = (id: string, parent_id: string | null, created_at: string) => ({
    id,
    parent_id,
    created_at,
  });

  it("returns top-level comments newest-first at depth 0", () => {
    const rows = [
      row("early", null, "2026-07-01T09:00:00Z"),
      row("late", null, "2026-07-01T17:00:00Z"),
    ];
    expect(childrenOf(rows, null, 0).map((r) => r.id)).toEqual(["late", "early"]);
  });

  it("returns replies oldest-first below depth 0", () => {
    const rows = [
      row("p", null, "2026-07-01T09:00:00Z"),
      row("r-late", "p", "2026-07-01T17:00:00Z"),
      row("r-early", "p", "2026-07-01T10:00:00Z"),
    ];
    expect(childrenOf(rows, "p", 1).map((r) => r.id)).toEqual(["r-early", "r-late"]);
  });

  it("re-homes an orphan reply (missing parent) as a top-level comment", () => {
    // 'ghost' isn't in the set, so 'orphan' surfaces at the root instead of
    // disappearing.
    const rows = [
      row("root", null, "2026-07-01T09:00:00Z"),
      row("orphan", "ghost", "2026-07-01T12:00:00Z"),
    ];
    expect(childrenOf(rows, null, 0).map((r) => r.id)).toEqual(["orphan", "root"]);
  });

  it("does not treat a real reply as top-level", () => {
    const rows = [
      row("p", null, "2026-07-01T09:00:00Z"),
      row("r", "p", "2026-07-01T10:00:00Z"),
    ];
    expect(childrenOf(rows, null, 0).map((r) => r.id)).toEqual(["p"]);
  });
});
