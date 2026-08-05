import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";

// A restore is used on the worst day someone is having, so it must not make the
// day worse.
//
// The per-table `JSON.parse` used to sit inside the insert loop, unguarded, and
// below `assertEmpty`. One malformed `data/<table>.json` in an otherwise-valid
// archive therefore threw a raw SyntaxError halfway through — after earlier
// tables had already been inserted. Three things then compounded:
//
//   1. The route turns a non-ImportRefused throw into a flat
//      `{"error":"import failed"}` 500, naming neither the table nor the fact
//      that anything had been written.
//   2. The database is no longer empty, so `assertEmpty` refuses the retry.
//   3. Which is the only recovery path the feature offers.
//
// The whole archive is validated before the first write now, so a corrupt file
// is refused with the database untouched and the retry still available.

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => sb.client }));

import { buildZip } from "@/lib/backup/zip";
import { runImport, ImportRefused } from "@/lib/backup/import";
import { EXPORT_FORMAT_VERSION } from "@/lib/backup/manifest";

const enc = (s: string) => new TextEncoder().encode(s);

/** An archive whose `trips` table is valid and whose `posts` table is not. */
function archive(opts: { postsBody: string; tripsBody?: string }) {
  return buildZip([
    {
      name: "manifest.json",
      data: enc(
        JSON.stringify({
          formatVersion: EXPORT_FORMAT_VERSION,
          sojournVersion: "0.1.2",
          createdAt: "2026-08-05T00:00:00.000Z",
          siteName: "Probe",
          tables: {},
          photos: { files: 0, bytes: 0, missing: [] },
          notIncluded: {},
        }),
      ),
    },
    {
      name: "data/trips.json",
      data: enc(opts.tripsBody ?? JSON.stringify([{ id: "t1", slug: "t", title: "Trip" }])),
    },
    { name: "data/posts.json", data: enc(opts.postsBody) },
  ]);
}

function emptyDb() {
  const base = makeFakeSupabase({});
  return {
    ...base,
    from: base.from.bind(base),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
}

beforeEach(() => {
  sb.client = emptyDb();
});

describe("a corrupt table refuses the whole archive", () => {
  it("refuses malformed JSON with a message naming the table", async () => {
    sb.client = emptyDb();
    await expect(archiveImport("{ not json")).rejects.toBeInstanceOf(ImportRefused);
    try {
      await runImport(archive({ postsBody: "{ not json" }));
    } catch (e) {
      expect((e as Error).message).toContain("data/posts.json");
      // The operator needs to know the state of their database, not just that
      // something went wrong.
      expect((e as Error).message).toContain("Nothing has been imported");
    }
  });

  it("refuses a table that is not a list of rows", async () => {
    await expect(
      runImport(archive({ postsBody: JSON.stringify({ not: "an array" }) })),
    ).rejects.toBeInstanceOf(ImportRefused);
  });

  it("writes NOTHING when a later table is corrupt", async () => {
    // The point of the change. `trips` is valid and sorts before `posts` in
    // EXPORTED_TABLES, so the old code inserted it and then threw.
    const db = emptyDb();
    sb.client = db;
    await expect(runImport(archive({ postsBody: "{{{" }))).rejects.toThrow();
    const store = (db as unknown as { store: Record<string, unknown[]> }).store;
    expect(
      store.trips ?? [],
      "an earlier table was written before the corrupt one was reached — the retry is now blocked",
    ).toHaveLength(0);
  });

  it("leaves the retry path open", async () => {
    // Same instance, corrected archive, must now succeed — which it cannot do
    // if the failed attempt left rows behind, because assertEmpty refuses.
    const db = emptyDb();
    sb.client = db;
    await expect(runImport(archive({ postsBody: "nope" }))).rejects.toThrow();

    const good = archive({
      postsBody: JSON.stringify([{ id: "p1", slug: "p", title: "Post", published: true }]),
    });
    const result = await runImport(good);
    expect(result.tables.posts).toBe(1);
    expect(result.tables.trips).toBe(1);
  });
});

describe("a valid archive still imports", () => {
  it("imports both tables", async () => {
    const result = await runImport(
      archive({ postsBody: JSON.stringify([{ id: "p1", slug: "p", title: "Post" }]) }),
    );
    expect(result.tables.trips).toBe(1);
    expect(result.tables.posts).toBe(1);
  });

  it("treats an absent table as empty rather than an error", async () => {
    // Older exports legitimately predate a table.
    const result = await runImport(
      archive({ postsBody: JSON.stringify([]) }),
    );
    expect(result.tables.posts).toBe(0);
  });
});

/** Helper so the first assertion reads cleanly. */
function archiveImport(postsBody: string) {
  return runImport(archive({ postsBody }));
}
