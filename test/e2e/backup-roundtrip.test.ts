import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";
import { makeSeed } from "../helpers/seed";

// Export one instance, import into an empty one, and check what arrived. This
// is the only test that exercises the feature the way someone moving hosts
// does, and the only one that would catch the two halves disagreeing about
// what an archive contains.

const storage = vi.hoisted(() => ({ files: new Map<string, Uint8Array>() }));
const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => sb.client }));

import { buildExport } from "@/lib/backup/export";
import { runImport, ImportRefused, parentsFirst } from "@/lib/backup/import";
import { EXPORTED_TABLES } from "@/lib/backup/manifest";

type Row = Record<string, unknown>;

/** The fake client, plus the storage surface both halves reach for. */
function client(db: Record<string, Row[]>) {
  const base = makeFakeSupabase(db as never);
  return {
    ...base,
    from: base.from.bind(base),
    storage: {
      from: () => ({
        async download(path: string) {
          const f = storage.files.get(path);
          return f
            ? { data: { arrayBuffer: async () => f.buffer }, error: null }
            : { data: null, error: { message: "not found" } };
        },
        async upload(path: string, data: Uint8Array) {
          storage.files.set(path, data);
          return { error: null };
        },
      }),
    },
  };
}

/** An instance with the schema in place and nothing in it. */
function emptyDb(): Record<string, Row[]> {
  return Object.fromEntries(EXPORTED_TABLES.map((t) => [t, [] as Row[]]));
}

describe("export → import, the way a move between hosts goes", () => {
  it("carries the writing, the structure and the photographs across", async () => {
    const { db, postId, photoIds } = makeSeed({ photoCount: 2 });
    const post = (db.posts as Row[]).find((p) => p.id === postId)! as Row;
    post.title = "Vom Wasserschloss in die Binghöhle";
    post.body = "## Aufstieg\n\nDer Weg war schmal.";

    const original = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7, 7]);
    const photos = db.photos as Row[];
    for (const p of photos) storage.files.set(p.storage_path as string, original);

    sb.client = client(db as never);
    const { zip } = await buildExport(new Date(Date.UTC(2026, 7, 4)));

    // A different instance: same schema, no content, and storage wiped so the
    // photographs have to come out of the archive rather than linger.
    // NB: makeFakeSupabase deep-clones its seed, so the import's writes land in
    // `target.store` — reading `fresh` back shows only what we put there.
    storage.files.clear();
    const target = client(emptyDb());
    sb.client = target;

    const result = await runImport(zip);

    expect(result.tables.posts).toBe((db.posts as Row[]).length);
    expect(result.tables.photos).toBe(photos.length);
    expect(result.photosFailed).toEqual([]);
    expect(result.from?.siteName).toBeTruthy();

    // The writing itself, not just a row count.
    const landed = (target.store.posts as Row[]).find((p) => p.id === postId);
    expect(landed?.title).toBe("Vom Wasserschloss in die Binghöhle");
    expect(landed?.body).toContain("Der Weg war schmal");

    // And the bytes of the photograph, which is the half a database dump alone
    // would have lost.
    expect([...storage.files.get(photos[0].storage_path as string)!]).toEqual([
      ...original,
    ]);
    expect(photoIds.length).toBe(2);
  });

  it("refuses an instance that already has writing in it", async () => {
    const { db } = makeSeed({ photoCount: 1 });
    sb.client = client(db as never);
    const { zip } = await buildExport();

    // Import back into the same, populated instance.
    sb.client = client(db as never);
    await expect(runImport(zip)).rejects.toThrow(ImportRefused);
    await expect(runImport(zip)).rejects.toThrow(/already has/);
  });

  it("refuses an archive from a newer Sojourn rather than dropping what it does not know", async () => {
    const { db } = makeSeed({ photoCount: 0 });
    sb.client = client(db as never);
    const { zip } = await buildExport();

    // Rewrite the manifest's version and repack, the way a future export would
    // look to today's code.
    const { readZip, buildZip } = await import("@/lib/backup/zip");
    const entries = readZip(zip).map((e) =>
      e.name === "manifest.json"
        ? {
            name: e.name,
            data: new TextEncoder().encode(
              JSON.stringify({
                ...JSON.parse(new TextDecoder().decode(e.data)),
                formatVersion: 99,
              }),
            ),
          }
        : e,
    );

    sb.client = client(emptyDb());
    await expect(runImport(buildZip(entries))).rejects.toThrow(/newer Sojourn/);
  });

  it("refuses a file that is not an archive", async () => {
    sb.client = client(emptyDb());
    await expect(
      runImport(Buffer.from("holiday-photo.jpg, uploaded by mistake")),
    ).rejects.toThrow(/not a Sojourn export/);
  });

  it("refuses an archive with no manifest", async () => {
    const { buildZip } = await import("@/lib/backup/zip");
    sb.client = client(emptyDb());
    await expect(
      runImport(buildZip([{ name: "data/posts.json", data: new Uint8Array([91, 93]) }])),
    ).rejects.toThrow(/no manifest/);
  });
});

describe("parentsFirst", () => {
  it("puts a comment before the reply to it", () => {
    const rows = [
      { id: "reply", parent_id: "top" },
      { id: "top", parent_id: null },
    ];
    expect(parentsFirst(rows).map((r) => r.id)).toEqual(["top", "reply"]);
  });

  it("handles a thread several deep", () => {
    const rows = [
      { id: "c", parent_id: "b" },
      { id: "b", parent_id: "a" },
      { id: "a", parent_id: null },
    ];
    expect(parentsFirst(rows).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps an orphan rather than dropping it", () => {
    // Its parent never made it into the archive. The row will fail its foreign
    // key and be reported — losing someone's comment in silence is worse.
    const rows = [{ id: "orphan", parent_id: "gone" }];
    expect(parentsFirst(rows)).toHaveLength(1);
  });

  it("terminates on a cycle instead of spinning", () => {
    const rows = [
      { id: "a", parent_id: "b" },
      { id: "b", parent_id: "a" },
    ];
    expect(parentsFirst(rows)).toHaveLength(2);
  });
});
