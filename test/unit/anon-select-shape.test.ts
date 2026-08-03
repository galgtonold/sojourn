import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

// Column-scoping a table for `anon` silently breaks two PostgREST shapes, and
// both failures look like "the content just isn't there" rather than an error:
// getPostBySlug returns null on error, so the page renders as not-found.
//
// This has now happened twice.
//
//   0036 scoped posts/trips  → `select=*` started returning 42501. Caught during
//                              a backup, by hand.
//   0043 scoped comments     → `comments(count)` started returning 42501, because
//                              PostgREST compiles it to count(*) and Postgres
//                              checks count(*) against TABLE-level SELECT.
//                              Every post page on the live site rendered as
//                              not-found until someone browsed to one.
//
// Nothing in this suite runs as a Postgres role, so neither was caught by a test.
// This is the cheap guard that would have: read which tables the migrations
// column-scope, then read the select strings the public data layer sends, and
// refuse the two shapes that require a privilege those tables no longer grant.

const CONTENT = readFileSync("src/lib/content.ts", "utf8");
const MIGRATIONS_DIR = "supabase/migrations";

/** Tables whose anon SELECT is column-scoped — `revoke select … from anon`. */
function columnScopedTables(): string[] {
  const found = new Set<string>();
  for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8");
    // `revoke select on public.X from anon` followed later by `grant select (…)`
    for (const m of sql.matchAll(
      /revoke\s+select\s+on\s+public\.(\w+)\s+from\s+anon/gi,
    )) {
      found.add(m[1]);
    }
  }
  return [...found];
}

/** The `.select("…")` payloads the public data layer sends. */
function publicSelects(): string[] {
  const out: string[] = [];
  // Template-literal constants (POST_SELECT and friends) …
  for (const m of CONTENT.matchAll(/const\s+\w*SELECT\w*\s*=\s*`([^`]+)`/g)) {
    out.push(m[1]);
  }
  // … and inline .select("…") / .select(`…`) calls.
  for (const m of CONTENT.matchAll(/\.select\(\s*[`"]([^`"]+)[`"]/g)) {
    out.push(m[1]);
  }
  return out;
}

describe("what the public data layer may ask anon for", () => {
  const scoped = columnScopedTables();

  it("knows which tables are column-scoped", () => {
    // If this ever empties, the guard below silently stops guarding.
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped).toContain("comments");
    expect(scoped).toContain("posts");
  });

  it("never embeds a bare (count) on a column-scoped table", () => {
    // PostgREST turns `comments(count)` into count(*), and Postgres checks
    // count(*) against table-level SELECT. The explicit form
    // `comments(id.count())` is not a way out either — PostgREST answers
    // PGRST123 unless aggregates are enabled, and they are not.
    const offenders = publicSelects().flatMap((sel) =>
      scoped.filter((t) => new RegExp(`\\b${t}\\s*\\(\\s*count\\s*\\)`).test(sel)),
    );
    expect(
      offenders,
      `these would 42501 for anon and render every affected page as not-found: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("never selects * from a column-scoped table", () => {
    const offenders = publicSelects().flatMap((sel) =>
      scoped.filter((t) => new RegExp(`\\b${t}\\s*\\(\\s*\\*\\s*\\)`).test(sel)),
    );
    expect(
      offenders,
      `column grants do not satisfy select=*: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("still selects the columns the post page actually needs", () => {
    // Guard against "fixing" the above by deleting the query.
    const post = publicSelects().find((s) => s.includes("cover_image"));
    expect(post).toBeDefined();
    for (const col of ["slug", "title", "body", "published"]) {
      expect(post).toContain(col);
    }
  });
});
