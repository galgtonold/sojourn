import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  EXPORTED_TABLES,
  EXCLUDED_TABLES,
  EXPORT_FORMAT_VERSION,
  canImport,
  exportFilename,
} from "@/lib/backup/manifest";

// An export is what someone has when their server is gone. The failure that
// matters is not a crash — it is a table quietly missing from the archive,
// noticed months later by someone rebuilding from it.
//
// So: every table the migrations create must be either exported or explicitly
// excluded with a reason. Add a table and forget, and this fails at the point
// the decision is cheap.

function tablesInSchema(): string[] {
  const dir = "supabase/migrations";
  const names = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(`${dir}/${file}`, "utf8");
    for (const m of sql.matchAll(
      /create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi,
    )) {
      names.add(m[1]);
    }
  }
  return [...names].sort();
}

describe("every table is classified", () => {
  it("finds the schema, so the sweep below is not vacuous", () => {
    const tables = tablesInSchema();
    expect(tables.length).toBeGreaterThan(15);
    expect(tables).toContain("posts");
  });

  it("exports or explicitly excludes each one", () => {
    const classified = new Set<string>([
      ...EXPORTED_TABLES,
      ...Object.keys(EXCLUDED_TABLES),
    ]);
    const unclassified = tablesInSchema().filter((t) => !classified.has(t));
    expect(
      unclassified,
      `these tables are neither exported nor excluded — decide, in src/lib/backup/manifest.ts: ${unclassified.join(", ")}`,
    ).toEqual([]);
  });

  it("never both exports and excludes the same table", () => {
    const both = EXPORTED_TABLES.filter((t) => t in EXCLUDED_TABLES);
    expect(both).toEqual([]);
  });

  it("gives a reason for every exclusion", () => {
    for (const [table, why] of Object.entries(EXCLUDED_TABLES)) {
      expect(why.length, `${table} excluded without a reason`).toBeGreaterThan(10);
    }
  });

  it("keeps out everything that hangs off auth.users", () => {
    // The export cannot carry accounts, so a row referencing one fails its
    // foreign key on the new host — a half-imported journal, which is the exact
    // outcome the import guard exists to prevent.
    for (const table of ["profiles", "trip_members"]) {
      expect(EXPORTED_TABLES as readonly string[]).not.toContain(table);
      expect(EXCLUDED_TABLES).toHaveProperty(table);
    }
  });

  it("keeps secrets and single-use tokens out", () => {
    // An export is a file people email to themselves. It must not carry
    // credentials, and a stale invite token is worse than no invite at all.
    for (const table of ["app_secrets", "member_invites", "push_subscriptions"]) {
      expect(EXPORTED_TABLES as readonly string[]).not.toContain(table);
      expect(EXCLUDED_TABLES).toHaveProperty(table);
    }
  });

  it("orders tables so a row is written after what it points at", () => {
    // Import replays this list top-down. A post before its trip is a foreign
    // key violation halfway through, and a half-imported journal.
    const order = EXPORTED_TABLES as readonly string[];
    const before = (a: string, b: string) => order.indexOf(a) < order.indexOf(b);
    expect(before("trips", "posts")).toBe(true);
    expect(before("posts", "photos")).toBe(true);
    expect(before("posts", "comments")).toBe(true);
    expect(before("posts", "interactions")).toBe(true);
    expect(before("interactions", "interaction_responses")).toBe(true);
    expect(before("comments", "comment_likes")).toBe(true);
  });
});

describe("canImport", () => {
  it("accepts its own version and older", () => {
    expect(canImport(EXPORT_FORMAT_VERSION)).toBe(true);
    expect(canImport(1)).toBe(true);
  });

  it("refuses an archive from a newer Sojourn", () => {
    // It may carry tables this version would drop on the floor. Refusing is
    // recoverable; a silently incomplete import is not.
    expect(canImport(EXPORT_FORMAT_VERSION + 1)).toBe(false);
  });

  it("refuses nonsense rather than guessing", () => {
    expect(canImport(0)).toBe(false);
    expect(canImport(-1)).toBe(false);
    expect(canImport(1.5)).toBe(false);
    expect(canImport(NaN)).toBe(false);
  });
});

describe("exportFilename", () => {
  it("reads as a date and sorts chronologically", () => {
    const name = exportFilename(new Date(Date.UTC(2026, 7, 4, 13, 5, 0)));
    expect(name).toBe("sojourn-export-2026-08-04-1305.zip");
  });

  it("stays sortable across a month boundary", () => {
    const a = exportFilename(new Date(Date.UTC(2026, 7, 31, 23, 0)));
    const b = exportFilename(new Date(Date.UTC(2026, 8, 1, 1, 0)));
    expect([b, a].sort()).toEqual([a, b]);
  });
});
