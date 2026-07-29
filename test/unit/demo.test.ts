import { describe, it, expect } from "vitest";
import { demoBlocks } from "@/lib/demo";
import { config } from "@/middleware";

// The demo deployment is read-only for EVERYONE — there is no account that can
// still write. That is what makes the policy a pure function of path + method:
// no session lookup, nothing to leak, nothing to reset after a vandal. Demo
// content is written by the seed script, never through the UI.
//
// `demoBlocks` answers "would demo mode refuse this?"; the caller checks whether
// demo mode is on at all.

describe("demoBlocks — admin API", () => {
  it("refuses every admin mutation", () => {
    expect(demoBlocks("/api/admin/posts", "POST")).toBe(true);
    expect(demoBlocks("/api/admin/settings/ai", "PUT")).toBe(true);
    expect(demoBlocks("/api/admin/comments/abc-123", "DELETE")).toBe(true);
    expect(demoBlocks("/api/admin/photos/upload", "PATCH")).toBe(true);
  });

  it("refuses admin routes that do not exist yet", () => {
    // The whole point of guarding by prefix: a route added next month is
    // covered without anyone remembering to come back here.
    expect(demoBlocks("/api/admin/something/nobody/wrote/yet", "POST")).toBe(true);
  });

  it("allows reads, so a future admin GET keeps working", () => {
    expect(demoBlocks("/api/admin/posts", "GET")).toBe(false);
    expect(demoBlocks("/api/admin/posts", "HEAD")).toBe(false);
    expect(demoBlocks("/api/admin/posts", "OPTIONS")).toBe(false);
  });

  it("matches the method however the client spells it", () => {
    expect(demoBlocks("/api/admin/posts", "post")).toBe(true);
    expect(demoBlocks("/api/admin/posts", "Delete")).toBe(true);
  });

  it("stops at the path segment boundary", () => {
    // /api/administrators is not /api/admin/…
    expect(demoBlocks("/api/administrators", "POST")).toBe(false);
    expect(demoBlocks("/api/adminx", "POST")).toBe(false);
  });
});

describe("demoBlocks — public API", () => {
  it("refuses new comments — free text on an unmoderated showcase", () => {
    expect(demoBlocks("/api/comments", "POST")).toBe(true);
  });

  it("still serves the comments already seeded", () => {
    expect(demoBlocks("/api/comments", "GET")).toBe(false);
  });

  it("allows the playful writes: reactions, poll votes, comment likes", () => {
    // No free text, so nothing to deface — and they are half the fun of a demo.
    expect(demoBlocks("/api/reactions", "POST")).toBe(false);
    expect(demoBlocks("/api/interactions", "POST")).toBe(false);
    expect(demoBlocks("/api/comments/like", "POST")).toBe(false);
  });

  it("leaves pages alone — the demo is for reading", () => {
    expect(demoBlocks("/admin/posts/new", "GET")).toBe(false);
    expect(demoBlocks("/trips/iceland", "GET")).toBe(false);
  });
});

describe("middleware matcher", () => {
  it("covers the API paths the guard has to see", () => {
    // A correct policy the middleware never runs is the failure mode that would
    // actually ship: the default matcher excludes /api entirely.
    expect(config.matcher).toContain("/api/admin/:path*");
    expect(config.matcher).toContain("/api/comments");
  });
});
