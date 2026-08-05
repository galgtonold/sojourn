import { describe, it, expect, vi, beforeEach } from "vitest";

// "My journal is empty" and "my database is unreachable" used to produce
// identical evidence.
//
// The data layer catches everything and returns `[]`, which is the right
// reader-facing behaviour — a transient outage must not render as a broken
// page. But it logged nothing, and `logError`'s own doc comment names this
// exact layer as the reason it exists. It was called from three places, none of
// them here.
//
// The empty-state work sharpened it: an outage now renders the *friendly* empty
// state, byte-for-byte what a brand-new install shows. For a self-hoster whose
// only diagnostic is `docker logs`, those two situations were indistinguishable.
//
// The reader-facing behaviour is unchanged. Only the silence is.

const logged = vi.hoisted(() => ({ scopes: [] as string[] }));

vi.mock("@/lib/log", () => ({
  logError: (scope: string) => logged.scopes.push(scope),
}));

// A client whose every query throws, i.e. Supabase unreachable.
vi.mock("@/lib/supabase/public", () => ({
  getPublicSupabase: () => {
    const boom = () => {
      throw new Error("ECONNREFUSED");
    };
    const chain: Record<string, unknown> = {};
    for (const k of ["from", "select", "eq", "in", "order", "limit", "range", "maybeSingle", "single", "textSearch", "not"]) {
      chain[k] = boom;
    }
    return chain;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => null }));

import { getPublishedPosts, getPostBySlug, getTrips, getComments } from "@/lib/content";

beforeEach(() => {
  logged.scopes = [];
});

describe("an unreachable database is visible in the logs", () => {
  it("still returns the empty shape to the reader", async () => {
    // Unchanged behaviour: the page renders, it just has nothing in it.
    await expect(getPublishedPosts()).resolves.toEqual([]);
  });

  it("says which read failed, not merely that something did", async () => {
    await getPublishedPosts();
    expect(logged.scopes).toContain("content.getPublishedPosts");
  });

  it("logs for a single post too", async () => {
    await getPostBySlug("anything");
    expect(logged.scopes).toContain("content.getPostBySlug");
  });

  it("logs for trips", async () => {
    await getTrips();
    expect(logged.scopes).toContain("content.getTrips");
  });

  it("logs for comments", async () => {
    await getComments("post-1");
    expect(logged.scopes).toContain("content.getComments");
  });

  it("names the function, so the log points somewhere", async () => {
    // The whole value over a bare `logError("content", e)`: a self-hoster
    // reading `docker logs` learns which query is failing.
    await getPublishedPosts();
    await getTrips();
    expect(new Set(logged.scopes).size).toBeGreaterThan(1);
    for (const s of logged.scopes) expect(s).toMatch(/^content\.[a-zA-Z]+$/);
  });
});
