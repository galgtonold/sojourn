import { describe, it, expect } from "vitest";
import { readFileSync, globSync } from "node:fs";

// "A session is not a permission" lives in exactly one file.
//
// `admin-route.ts` is where the `profiles` role check sits — the rule 0043 made
// the schema depend on. Every route that hand-rolls its own preamble instead is
// a route where that rule was never applied, and the pre-release review found
// three of them: `posts/[id]/translate` (an unbounded 8000-token run on any
// post id, for anyone holding any session), `ai/embeddings` (billed embedding
// calls on a bare session) and `revalidate` (evict the whole ISR cache).
//
// Those three are fixed. The point of this test is the eleventh route nobody
// has written yet: a rule implemented once and applied by eleven separate hands
// is a rule that keeps being missed. Adding an admin route outside the wrappers
// now means editing the list below, in a file called "coverage", with a comment
// explaining why — which is a conversation, not an oversight.

// Three ways a route can legitimately establish that the caller may act, in
// descending order of preference:
//
//  1. A wrapper. `adminRoute` / `adminRouteWithParams` / `requireOwner` carry
//     the profiles role check — the rule 0043 made the schema depend on.
//  2. An RLS write that returns rows. Strictly STRONGER than the role check,
//     because it asks about this resource rather than this account: the
//     database answers "may this caller edit THIS post", and zero rows is a
//     403. `posts/[id]/translate` uses it deliberately for that reason.
//  3. An explicit profiles lookup, for routes that touch no table of their own.
//
// What is not acceptable is none of the three, which is where three billable
// endpoints were found.
const GATED = [
  /\b(adminRoute|adminRouteWithParams|requireOwner|ownerRoute)\b/,
  /\.select\("id"\)[\s\S]{0,600}?status: 403/,
  /from\("profiles"\)[\s\S]{0,600}?status: 403/,
  // `getViewer()` reads profiles AND trip_members, and the create routes use it
  // to 403 a member reaching outside their granted trips. Same rule, spelled
  // for a route that has no existing row to check against.
  /getViewer\(\)[\s\S]{0,600}?status: 403/,
];

/**
 * Routes that legitimately sit outside the wrappers, and why.
 *
 * Shrinking this list is the direction of travel. Growing it should require
 * saying something true here.
 */
const EXCEPTIONS: Record<string, string> = {
  "admin/ai/job/[id]/route.ts":
    "a polled status read of the caller's own job, through the RLS client — " +
    "no write to confirm, and nothing to leak beyond what RLS already scopes",
  "admin/trips/route.ts":
    "creating a trip is gated by RLS alone: 0006 sets `for insert to " +
    "authenticated with check (is_owner())`, so a non-owner is refused by the " +
    "database. The flaw is cosmetic — that refusal surfaces as a 500 with a " +
    "Postgres message rather than a 403 — and worth fixing, but it is not an " +
    "ungated route",
};

function adminRoutes(): string[] {
  return globSync("src/app/api/admin/**/route.ts").map((f) =>
    f.replace(/\\/g, "/").replace("src/app/api/", ""),
  );
}

describe("every admin route goes through the gate", () => {
  it("finds the admin routes at all", () => {
    // Guard the guard: an empty list would make the sweep vacuous.
    expect(adminRoutes().length).toBeGreaterThan(20);
  });

  it("uses a wrapper, or is a documented exception", () => {
    const naked = adminRoutes().filter((rel) => {
      if (rel in EXCEPTIONS) return false;
      const src = readFileSync(`src/app/api/${rel}`, "utf8");
      return !GATED.some((pattern) => pattern.test(src));
    });
    expect(
      naked,
      "these admin routes hand-roll their auth preamble. The profiles role check " +
        "lives in admin-route.ts, and a route outside it is a route where that " +
        "check was never applied — which is how three billable endpoints ended " +
        "up reachable by any session. Use adminRoute / adminRouteWithParams, or " +
        "add an entry to EXCEPTIONS saying why it cannot.",
    ).toEqual([]);
  });

  it("keeps every exception real", () => {
    // A stale exception is worse than none: it silently permits a route that
    // has since been deleted or fixed.
    const present = new Set(adminRoutes());
    for (const rel of Object.keys(EXCEPTIONS)) {
      expect(present, `${rel} is listed as an exception but does not exist`).toContain(rel);
    }
  });

  it("still checks the profile inside the wrapper", () => {
    // The thing all of the above is protecting. If this check ever leaves
    // admin-route.ts, the sweep above is guarding an empty room.
    const src = readFileSync("src/lib/api/admin-route.ts", "utf8");
    expect(src).toMatch(/from\("profiles"\)/);
    expect(src).toMatch(/role !== "owner" && role !== "member"/);
    expect(src).toMatch(/A session is not a permission/);
  });
});
