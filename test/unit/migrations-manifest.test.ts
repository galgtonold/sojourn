import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import {
  MIGRATIONS,
  pendingAfter,
  isKnownMigration,
  latestMigration,
} from "@/lib/migrations";

// The manifest is the order. Filenames are not, and cannot be: 00271 sorts
// BEFORE 0027 because "1" precedes "_". A runner that inferred order from the
// directory would apply those two the wrong way round, and nothing would say so.
//
// The tests that matter most here are the two that fail when the manifest and
// the directory disagree — because that is the failure with no other symptom:
// add a migration, forget the manifest, and it silently never runs.

const DIR = "supabase/migrations";
const onDisk = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

describe("the manifest and the directory agree", () => {
  it("lists every file that exists", () => {
    const missing = onDisk.filter((f) => !MIGRATIONS.includes(f));
    expect(missing, `not in the manifest: ${missing.join(", ")}`).toEqual([]);
  });

  it("lists nothing that doesn't exist", () => {
    const set = new Set(onDisk);
    const ghosts = MIGRATIONS.filter((f) => !set.has(f));
    expect(ghosts, `in the manifest but not on disk: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("lists each file exactly once", () => {
    expect(new Set(MIGRATIONS).size).toBe(MIGRATIONS.length);
  });
});

describe("the order is declared, not inferred", () => {
  it("places 00271 where both live databases actually applied it", () => {
    // Between 0026 and 0027 — not last. Production's ledger timestamps
    // tighten_anon_grants at 20260624084324, seconds after
    // restrict_unpublished_geo and days before photo_capture_offset; the demo,
    // built by `supabase db push`, applied it in the same position.
    const restrict = MIGRATIONS.indexOf("0026_restrict_unpublished_geo.sql");
    const tighten = MIGRATIONS.indexOf("00271_tighten_anon_grants.sql");
    const capture = MIGRATIONS.indexOf("0027_photo_capture_offset.sql");
    expect(restrict).toBeGreaterThanOrEqual(0);
    expect(tighten).toBe(restrict + 1);
    expect(capture).toBe(tighten + 1);
  });

  it("disagrees with a numeric sort, which is the point", () => {
    // `sort -V` reads 00271 as two-hundred-and-seventy-one and puts it last,
    // which would contradict every database that has already run it.
    const numeric = [...onDisk].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    expect(numeric[numeric.length - 1]).toBe("00271_tighten_anon_grants.sql");
    expect(MIGRATIONS[MIGRATIONS.length - 1]).not.toBe(
      "00271_tighten_anon_grants.sql",
    );
  });

  it("starts at the initial schema", () => {
    expect(MIGRATIONS[0]).toBe("0001_init.sql");
  });
});

describe("pendingAfter", () => {
  it("returns everything when nothing has been applied", () => {
    expect(pendingAfter(null)).toEqual([...MIGRATIONS]);
  });

  it("returns nothing when the watermark is the last entry", () => {
    expect(pendingAfter(latestMigration())).toEqual([]);
  });

  it("returns only what follows the watermark, in order", () => {
    const third = MIGRATIONS[2];
    const rest = pendingAfter(third);
    expect(rest[0]).toBe(MIGRATIONS[3]);
    expect(rest).toHaveLength(MIGRATIONS.length - 3);
  });

  it("throws on a watermark it doesn't recognise", () => {
    // The alternative is treating an unknown watermark as "nothing applied" and
    // replaying history against a live database. A loud failure is the only
    // safe reading of "I don't know where this database is".
    expect(() => pendingAfter("0099_does_not_exist.sql")).toThrow(/unknown migration/i);
  });
});

describe("isKnownMigration", () => {
  it("accepts a real entry and rejects anything else", () => {
    expect(isKnownMigration(MIGRATIONS[0])).toBe(true);
    expect(isKnownMigration("nope.sql")).toBe(false);
    expect(isKnownMigration("")).toBe(false);
  });
});
