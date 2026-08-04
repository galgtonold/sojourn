import { describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeFakeSupabase } from "../helpers/fake-supabase";
import { makeSeed } from "../helpers/seed";

// Builds a real archive from a real (faked) database and reads it back with
// CPython, because the thing worth checking is not that the code ran — it is
// that what comes out is openable and contains what it claims to.

const storage = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
}));
const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => sb.client }));

import { buildExport } from "@/lib/backup/export";
import { EXPORTED_TABLES } from "@/lib/backup/manifest";

/** The fake client plus the storage surface the exporter reaches for. */
function clientWithStorage(db: Record<string, unknown[]>) {
  const base = makeFakeSupabase(db as never);
  return {
    ...base,
    from: base.from.bind(base),
    storage: {
      from: () => ({
        async download(path: string) {
          const file = storage.files.get(path);
          return file
            ? { data: { arrayBuffer: async () => file.buffer }, error: null }
            : { data: null, error: { message: "not found" } };
        },
      }),
    },
  };
}

function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasPython())("the export archive", () => {
  it("carries every table, the photo files, and a readable manifest", async () => {
    const { db, postId } = makeSeed({ photoCount: 2 });
    const post = (db.posts as { id: string; title: string }[]).find(
      (p) => p.id === postId,
    )!;
    post.title = "Vom Wasserschloss in die Binghöhle";

    // One photo present, one whose file has vanished from storage — that second
    // case is a fact about real instances, and must not sink the export.
    const photos = db.photos as { id: string; storage_path: string }[];
    storage.files.set(photos[0].storage_path, new Uint8Array([0xff, 0xd8, 1, 2, 3]));
    storage.files.delete(photos[1].storage_path);

    sb.client = clientWithStorage(db as never);

    const at = new Date(Date.UTC(2026, 7, 4, 13, 5));
    const { zip, manifest } = await buildExport(at);

    expect(manifest.photos.files).toBe(1);
    expect(manifest.photos.missing).toEqual([photos[1].storage_path]);
    expect(manifest.tables.posts).toBeGreaterThan(0);

    const dir = mkdtempSync(join(tmpdir(), "sojourn-export-"));
    try {
      const path = join(dir, "export.zip");
      writeFileSync(path, zip);
      const script = join(dir, "check.py");
      writeFileSync(
        script,
        [
          "import zipfile, json, sys",
          "z = zipfile.ZipFile(sys.argv[1])",
          "print(json.dumps({",
          "  'bad': z.testzip(),",
          "  'names': z.namelist(),",
          "  'manifest': json.loads(z.read('manifest.json')),",
          "  'posts': json.loads(z.read('data/posts.json')),",
          "  'readme': z.read('README.txt').decode(),",
          "}))",
        ].join("\n"),
      );
      const out = JSON.parse(
        execFileSync("python3", [script, path], { encoding: "utf8" }),
      ) as {
        bad: string | null;
        names: string[];
        manifest: { tables: Record<string, number> };
        posts: { title: string }[];
        readme: string;
      };

      expect(out.bad, "a CRC did not match").toBeNull();

      // Every table has a file, even the empty ones — an absent file reads as
      // "this version did not export that", which is a different claim.
      for (const table of EXPORTED_TABLES) {
        expect(out.names, `no data/${table}.json`).toContain(`data/${table}.json`);
      }
      expect(out.names).toContain(`photos/${photos[0].storage_path}`);
      expect(out.names).not.toContain(`photos/${photos[1].storage_path}`);

      // The umlaut survived JSON, the archive, and Python.
      expect(out.posts.some((p) => p.title.includes("Binghöhle"))).toBe(true);

      // The README has to say what is missing, since that is what someone
      // rebuilding from this will otherwise assume is present.
      expect(out.readme).toContain("app_secrets");
      expect(out.readme).toContain("Accounts and passwords are not here");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The photographs used to be fetched one after another, so an instance with a
  // couple of hundred paid a round trip each, end to end, while the owner
  // watched a spinner. This is a wall-clock assertion because that is the thing
  // that was wrong — a pool that exists but is not wired in passes every other
  // test in this file.
  it("fetches photographs several at a time, not one after another", async () => {
    const DELAY = 20;
    const COUNT = 16;
    const { db } = makeSeed({ photoCount: COUNT });
    for (const p of db.photos as { storage_path: string }[]) {
      storage.files.set(p.storage_path, new Uint8Array([1, 2, 3]));
    }

    const slow = {
      ...makeFakeSupabase(db as never),
      from: makeFakeSupabase(db as never).from.bind(makeFakeSupabase(db as never)),
      storage: {
        from: () => ({
          async download(path: string) {
            await new Promise((r) => setTimeout(r, DELAY));
            const f = storage.files.get(path);
            return f
              ? { data: { arrayBuffer: async () => f.buffer }, error: null }
              : { data: null, error: { message: "not found" } };
          },
        }),
      },
    };
    sb.client = slow;

    const started = performance.now();
    const { manifest } = await buildExport(new Date(Date.UTC(2026, 7, 4)));
    const elapsed = performance.now() - started;

    expect(manifest.photos.files).toBe(COUNT);
    // Sequential would be at least COUNT * DELAY (320ms). Eight at a time is
    // ~40ms. The threshold sits well clear of both, so a slow machine does not
    // make this flaky but a reverted pool does fail it.
    expect(
      elapsed,
      `took ${Math.round(elapsed)}ms — sequential would be ~${COUNT * DELAY}ms`,
    ).toBeLessThan((COUNT * DELAY) / 2);
  });
});
