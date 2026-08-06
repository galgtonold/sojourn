import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unaccentQuery } from "@/lib/search-normalize";

// Searching for "Vrango" could not find the story called "Vrångö".
//
// Measured against production before the fix: "Vrångö" → 1 post, "Vrango" → 0.
// Not exotic for this journal — Göteborg, Härjedalen, Vrångö, Fränkische — and
// the reader typing them is usually on a keyboard without the diacritic, or
// half-remembering the spelling. The exact-title match is precisely the case
// where a reader already knows what they want.
//
// Both sides have to agree: 0049 stores the index unaccented, this normalises
// the query. A query normalised by a DIFFERENT rule than the stored side would
// miss just as reliably as one not normalised at all, which is why the German
// transliteration (ö → oe) is deliberately not used here.

describe("unaccentQuery", () => {
  it("handles the reported case", () => {
    expect(unaccentQuery("Vrångö").toLowerCase()).toBe("vrango");
  });

  it("handles the place names this journal is full of", () => {
    expect(unaccentQuery("Göteborg")).toBe("Goteborg");
    expect(unaccentQuery("Härjedalen")).toBe("Harjedalen");
    expect(unaccentQuery("Fränkische Schweiz")).toBe("Frankische Schweiz");
  });

  it("leaves unaccented text exactly as it was", () => {
    // It runs on every query, so it must be a no-op for most of them.
    for (const q of ["Berge", "bike ride", "13-7", ""]) {
      expect(unaccentQuery(q)).toBe(q);
    }
  });

  it("preserves case and spacing, which the tsquery still needs", () => {
    expect(unaccentQuery("Von Göteborg nach Vrångö")).toBe("Von Goteborg nach Vrango");
  });

  it("strips the mark, not the letter", () => {
    // The failure that would look like it works: dropping the whole character
    // turns "Vrångö" into "Vrng" and matches nothing at all.
    expect(unaccentQuery("Vrångö")).toHaveLength("Vrångö".length);
  });

  it("does not transliterate the German way", () => {
    // ö → oe would disagree with Postgres `unaccent`, and disagreement is the
    // same as doing nothing.
    expect(unaccentQuery("Göteborg")).not.toContain("oe");
  });
});

describe("both sides of the search agree", () => {
  const CONTENT = readFileSync("src/lib/content.ts", "utf8");
  const MIGRATION = readFileSync(
    "supabase/migrations/0049_accent_insensitive_search.sql",
    "utf8",
  );

  it("normalises every query path, not just the ranked one", () => {
    // The RPC takes both `query_text` and the expanded `ts_query`, and there is
    // a plain-textSearch fallback for instances that predate the RPC. A missed
    // one is a path where accented and unaccented silently stop meeting.
    expect(CONTENT).toMatch(/query_text: unaccentQuery\(/);
    expect(CONTENT).toMatch(/buildExpandedTsQuery\(unaccentQuery\(/);
    expect(CONTENT).toMatch(/textSearch\("search_tsv", unaccentQuery\(/);
  });

  it("stores the index unaccented on both searchable tables", () => {
    for (const table of ["posts", "photos"]) {
      expect(MIGRATION).toMatch(new RegExp(`alter table public\\.${table}`));
    }
    // Every weighted field goes through the wrapper; one plain `to_tsvector`
    // left behind would make that field accent-sensitive on its own.
    const weights = MIGRATION.match(/setweight\(to_tsvector\([^)]*\)/g) ?? [];
    expect(weights.length).toBe(8);
    for (const w of weights) expect(w).toContain("immutable_unaccent");
  });

  it("re-grants the regenerated column to anon", () => {
    // Dropping a generated column drops its grant. 0036 and 0043 column-scoped
    // these tables, so forgetting this is how `select=*` broke once already.
    expect(MIGRATION).toMatch(/grant select \(search_tsv\) on public\.posts to anon/);
    expect(MIGRATION).toMatch(/grant select \(search_tsv\) on public\.photos to anon/);
  });

  it("pins search_path on the immutable wrapper", () => {
    expect(MIGRATION).toMatch(/set search_path = extensions, public, pg_temp/);
  });
});
