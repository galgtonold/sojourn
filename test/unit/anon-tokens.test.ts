import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The deanonymisation leak 0043 closed on `comments`, left open on its two
// siblings for five more migrations.
//
// `reactions.visitor_token` and `comment_likes.visitor_token` hold the same
// `sojourn:vid` value from the same localStorage key, and both tables still had
// anon's table-level SELECT — so `?select=visitor_token,post_id,kind` returned
// everything one browser had ever reacted to, to anyone holding the public anon
// key. Verified against production before the fix: anon could read the token on
// both tables and not on `comments`.
//
// Written as source assertions on purpose. The fix lives in the database so a
// route edit cannot undo it, and nothing in this suite runs as a Postgres role
// — so these pin the shape of what was applied.

const MIGRATION = readFileSync(
  "supabase/migrations/0048_scope_anonymous_tokens.sql",
  "utf8",
);
const REACTIONS_ROUTE = readFileSync("src/app/api/reactions/route.ts", "utf8");
const LIKES_ROUTE = readFileSync("src/app/api/comments/like/route.ts", "utf8");
const MANIFEST = readFileSync("src/lib/migrations.mjs", "utf8");
const CONTENT = readFileSync("src/lib/content.ts", "utf8");

describe("the visitor token stops being readable", () => {
  it("re-grants SELECT column by column, never at table level", () => {
    // A table-level grant is what swept the column up in the first place, twice
    // (0020 then 0028). Column lists fail closed: a column added later is not
    // anon-readable until someone puts it here deliberately.
    expect(MIGRATION).toMatch(/revoke select on public\.reactions from anon/);
    expect(MIGRATION).toMatch(
      /grant select \(\s*id, post_id, kind, created_at\s*\) on public\.reactions to anon/,
    );
    expect(MIGRATION).toMatch(/revoke select on public\.comment_likes from anon/);
    expect(MIGRATION).toMatch(
      /grant select \(\s*id, comment_id, created_at\s*\) on public\.comment_likes to anon/,
    );
  });

  it("never names visitor_token in either anon grant", () => {
    // The whole point. Asserted separately from the column lists above so that
    // widening one of them cannot slip the token back in unnoticed.
    const grants = MIGRATION.match(/grant select \([^)]*\)/g) ?? [];
    expect(grants.length).toBe(2);
    for (const g of grants) expect(g).not.toContain("visitor_token");
  });
});

describe("the writes move behind functions, because they have to", () => {
  it("takes INSERT away from anon on both tables", () => {
    expect(MIGRATION).toMatch(/revoke insert on public\.reactions from anon/);
    expect(MIGRATION).toMatch(/revoke insert on public\.comment_likes from anon/);
  });

  it("pins search_path on both new security-definer functions", () => {
    // Unpinned, a definer function resolves names through the caller's
    // search_path and can be aimed at a table of their choosing.
    const definers = MIGRATION.match(/security definer/g) ?? [];
    expect(definers.length).toBe(2);
    const pinned = MIGRATION.match(/set search_path = public, pg_temp/g) ?? [];
    expect(pinned.length).toBe(2);
  });

  it("refuses a token too short to be one", () => {
    // A blank or stub token would collide with every other stub token and make
    // one visitor's reaction state everybody's. Same floor as 0046.
    expect(MIGRATION.match(/length\(p_token\) < 8/g) ?? []).toHaveLength(2);
  });

  it("revokes from anon and authenticated by name, not only from PUBLIC", () => {
    // Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions
    // in this schema to both roles. Revoking from PUBLIC leaves those explicit
    // grants in place — 0047 shipped believing otherwise and came back callable
    // by anon on production.
    expect(MIGRATION).toMatch(
      /revoke all on function public\.add_reaction\(uuid, text, text\) from public, anon, authenticated/,
    );
    expect(MIGRATION).toMatch(
      /revoke all on function public\.add_comment_like\(uuid, text\) from public, anon, authenticated/,
    );
  });
});

describe("the routes use the functions", () => {
  it("no longer writes to either table directly", () => {
    // `on conflict (post_id, kind, visitor_token)` needs SELECT on its arbiter
    // columns. With the token revoked, a direct upsert fails with 42501 — so
    // this is a correctness assertion as much as a security one.
    expect(REACTIONS_ROUTE).not.toMatch(/from\("reactions"\)\s*\.upsert/);
    expect(LIKES_ROUTE).not.toMatch(/from\("comment_likes"\)\s*\.upsert/);
  });

  it("calls the scoped function, passing the visitor's own token", () => {
    expect(REACTIONS_ROUTE).toMatch(/rpc\("add_reaction"/);
    expect(REACTIONS_ROUTE).toMatch(/p_token: token/);
    expect(LIKES_ROUTE).toMatch(/rpc\("add_comment_like"/);
    expect(LIKES_ROUTE).toMatch(/p_token: token/);
  });
});

describe("nothing embeds an aggregate on a column-scoped table", () => {
  it("keeps comment_likes(count) out of COMMENT_SELECT", () => {
    // 0048 column-scoped `comment_likes`, and PostgREST compiles an embedded
    // count to `count(comment_likes.*)` — which needs SELECT on every column,
    // including the one just revoked. The result was 42501 on the whole
    // comments query: every post rendered with no comments, server-side and
    // through /api/comments alike. Shipped and live for four hours.
    const select = /export const COMMENT_SELECT\s*=\s*([\s\S]*?);/.exec(CONTENT)?.[1] ?? "";
    expect(select).toBeTruthy();
    expect(select).not.toMatch(/comment_likes\s*\(/);
  });

  it("counts them separately instead", () => {
    expect(CONTENT).toMatch(/export async function withLikeCounts/);
    // Only the granted column, counted in memory.
    expect(CONTENT).toMatch(/from\("comment_likes"\)[\s\S]{0,80}select\("comment_id"\)/);
  });
});

describe("the migration is actually scheduled to run", () => {
  it("is declared in the manifest, after 0047", () => {
    // The runner works from this list, not from the directory. A migration file
    // nobody declared is a file that never runs — on any instance, forever.
    const order = [...MANIFEST.matchAll(/"(\d{4}_[^"]+\.sql)"/g)].map((m) => m[1]);
    expect(order).toContain("0048_scope_anonymous_tokens.sql");
    expect(order.indexOf("0048_scope_anonymous_tokens.sql")).toBe(
      order.indexOf("0047_shared_rate_limits.sql") + 1,
    );
  });
});
