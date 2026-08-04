import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// Both tables carried `for delete using (true)`. The app always scoped its own
// deletes to the caller's visitor_token, so nothing misbehaved — but the anon
// key is public by design, and `true` meant one request could empty every
// reaction and comment like on the site. Measured against a real database
// before the fix: 1720 reactions and 6 likes, in a single statement.
//
// These pin the shape of the fix, which lives in the database precisely so a
// future edit to a route cannot quietly undo it.

const MIGRATION = readFileSync(
  "supabase/migrations/0046_scope_anonymous_deletes.sql",
  "utf8",
);
const REACTIONS_ROUTE = readFileSync("src/app/api/reactions/route.ts", "utf8");
const LIKES_ROUTE = readFileSync("src/app/api/comments/like/route.ts", "utf8");

describe("the permissive delete policies are gone", () => {
  it("drops both `using (true)` policies", () => {
    expect(MIGRATION).toMatch(/drop policy if exists "remove own reaction" on public\.reactions/);
    expect(MIGRATION).toMatch(/drop policy if exists "remove own like" on public\.comment_likes/);
  });

  it("revokes the table privilege as well as the policy", () => {
    // Belt and braces: a later migration that adds a permissive policy by
    // accident still cannot hand the ability back without also re-granting.
    expect(MIGRATION).toMatch(/revoke delete on public\.reactions from anon/);
    expect(MIGRATION).toMatch(/revoke delete on public\.comment_likes from anon/);
  });
});

describe("the replacement functions cannot be aimed elsewhere", () => {
  it("pins search_path on every security-definer function", () => {
    // A definer function that resolves names through the caller's search_path
    // can be pointed at a table of their choosing.
    const definers = MIGRATION.match(/security definer/g) ?? [];
    const pinned = MIGRATION.match(/set search_path = public, pg_temp/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(pinned.length).toBe(definers.length);
  });

  it("refuses a token too short to be one", () => {
    // Without this, a blank token matches every row whose token is blank.
    expect(MIGRATION).toMatch(/length\(p_token\) < 8/);
  });

  it("grants execute to anon rather than leaving it to PUBLIC", () => {
    expect(MIGRATION).toMatch(/revoke all on function public\.remove_reaction/);
    expect(MIGRATION).toMatch(/grant execute on function public\.remove_reaction[^;]*to anon/);
    expect(MIGRATION).toMatch(/revoke all on function public\.remove_comment_like/);
    expect(MIGRATION).toMatch(/grant execute on function public\.remove_comment_like[^;]*to anon/);
  });
});

describe("the routes go through the functions", () => {
  it("no longer deletes from either table directly", () => {
    // A direct .delete() would now fail with "permission denied" in production
    // while passing against any fake that does not model the grant.
    expect(REACTIONS_ROUTE).not.toMatch(/from\("reactions"\)\s*\n?\s*\.delete\(\)/);
    expect(LIKES_ROUTE).not.toMatch(/from\("comment_likes"\)\s*\n?\s*\.delete\(\)/);
  });

  it("calls the scoped function, passing the visitor's own token", () => {
    expect(REACTIONS_ROUTE).toMatch(/rpc\("remove_reaction"/);
    expect(REACTIONS_ROUTE).toMatch(/p_token: token/);
    expect(LIKES_ROUTE).toMatch(/rpc\("remove_comment_like"/);
    expect(LIKES_ROUTE).toMatch(/p_token: token/);
  });
});
