import { describe, it, expect } from "vitest";
import { assessSchema } from "@/lib/schema-version.mjs";
import { MIGRATIONS, latestMigration } from "@/lib/migrations.mjs";

// The runner's whole job is deciding what a database still owes. Every wrong
// answer here is destructive in one direction or the other, so each case is
// pinned:
//
//   replay when it shouldn't  → 0001_init against live data
//   skip when it shouldn't    → schema silently behind the code, forever
//
// The case that needs the most care is "no watermark", which means two
// completely different things depending on whether the database is empty.

describe("a database that has never been touched", () => {
  it("owes the whole manifest", () => {
    const s = assessSchema({ watermark: null, hasExistingSchema: false });
    expect(s.kind).toBe("fresh");
    if (s.kind === "fresh") expect(s.pending).toEqual([...MIGRATIONS]);
  });
});

describe("a database with schema but no watermark", () => {
  it("refuses rather than replaying history", () => {
    // Every install that predates the watermark lands here. Treating it as
    // fresh would run 0001_init — which creates policies, not `if not exists` —
    // against a live database.
    const s = assessSchema({ watermark: null, hasExistingSchema: true });
    expect(s.kind).toBe("unseeded");
  });

  it("says so rather than assuming it is up to date", () => {
    // The opposite guess is just as wrong: assume current, and real migrations
    // never run again on that database.
    const s = assessSchema({ watermark: null, hasExistingSchema: true });
    expect(s.kind).not.toBe("current");
    expect(s.kind).not.toBe("fresh");
  });
});

describe("a seeded database", () => {
  it("is current when the watermark is the last entry", () => {
    const s = assessSchema({
      watermark: latestMigration(),
      hasExistingSchema: true,
    });
    expect(s.kind).toBe("current");
  });

  it("owes exactly what follows its watermark", () => {
    const s = assessSchema({
      watermark: MIGRATIONS[MIGRATIONS.length - 3],
      hasExistingSchema: true,
    });
    expect(s.kind).toBe("behind");
    if (s.kind === "behind") {
      expect(s.pending).toEqual(MIGRATIONS.slice(-2));
    }
  });
});

describe("a watermark this build has never heard of", () => {
  it("refuses, because it means the database is ahead or renamed", () => {
    // Rolling back the app to an older build puts a future migration name in
    // the watermark. Guessing either way corrupts something.
    const s = assessSchema({
      watermark: "0099_from_the_future.sql",
      hasExistingSchema: true,
    });
    expect(s.kind).toBe("unknown");
    if (s.kind === "unknown") expect(s.watermark).toBe("0099_from_the_future.sql");
  });
});

describe("only two states permit running anything", () => {
  it("fresh and behind carry work; the rest carry none", () => {
    const cases = [
      assessSchema({ watermark: null, hasExistingSchema: false }),
      assessSchema({ watermark: MIGRATIONS[0], hasExistingSchema: true }),
      assessSchema({ watermark: latestMigration(), hasExistingSchema: true }),
      assessSchema({ watermark: null, hasExistingSchema: true }),
      assessSchema({ watermark: "nope.sql", hasExistingSchema: true }),
    ];
    const runnable = cases.filter((c) => "pending" in c && c.pending.length > 0);
    expect(runnable.map((c) => c.kind)).toEqual(["fresh", "behind"]);
  });
});
