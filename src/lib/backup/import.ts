// Server-only: load an export into an instance that has nothing in it.
//
// Only into an empty one, and that is the whole safety model. Merging two
// journals means deciding what happens to two posts with the same slug, two
// site_settings rows, a comment whose post exists on one side only — questions
// software should not answer by guessing. Overwriting means a button that can
// destroy someone's writing, reachable over HTTP, behind one authorization
// check. Refusing unless the instance is empty makes the dangerous case
// unreachable rather than merely guarded.
//
// So this covers exactly the cases it should: moving to another host, and
// rebuilding after a loss. Both start empty.
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { readZip } from "@/lib/backup/zip";
import {
  EXPORTED_TABLES,
  canImport,
  type ExportManifest,
} from "@/lib/backup/manifest";

export class ImportRefused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ImportRefused";
  }
}

export type ImportResult = {
  tables: Record<string, number>;
  photos: number;
  photosFailed: string[];
  from: { sojournVersion: string; createdAt: string; siteName: string } | null;
};

/**
 * Sort rows so a parent always precedes its children.
 *
 * `comments.parent_id` points at `comments`, so a reply inserted before the
 * comment it answers fails its foreign key. Rows whose parent is absent from
 * the archive entirely are emitted last rather than dropped — losing a comment
 * silently is worse than one failed row someone can see.
 */
export function parentsFirst<T extends Record<string, unknown>>(
  rows: T[],
  idKey = "id",
  parentKey = "parent_id",
): T[] {
  const remaining = [...rows];
  const emitted = new Set<unknown>();
  const out: T[] = [];
  let progress = true;
  while (remaining.length > 0 && progress) {
    progress = false;
    for (let i = remaining.length - 1; i >= 0; i--) {
      const row = remaining[i];
      const parent = row[parentKey];
      if (parent == null || emitted.has(parent)) {
        out.push(row);
        emitted.add(row[idKey]);
        remaining.splice(i, 1);
        progress = true;
      }
    }
  }
  // A cycle, or a parent that never made it into the archive.
  return [...out, ...remaining];
}

/** The one thing that decides whether an import may run at all. */
async function assertEmpty(admin: NonNullable<ReturnType<typeof getAdminSupabase>>) {
  for (const table of ["posts", "trips"] as const) {
    // One row is enough to answer the question, and `limit(1)` is plain
    // PostgREST rather than its `count: "exact"` extension — which matters
    // because the guard everything else rests on should be exercisable by a
    // test, and a head-count request is the one shape a fake client will not
    // model. It quietly returned "empty" for a populated instance.
    const { data, error } = await admin.from(table).select("id").limit(1);
    if (error) {
      throw new ImportRefused(`could not check whether ${table} is empty`, 500);
    }
    if ((data?.length ?? 0) > 0) {
      throw new ImportRefused(
        `This instance already has ${table}. Import only works into a fresh ` +
          `Sojourn — it will not merge with, or overwrite, what is here.`,
        409,
      );
    }
  }
}

export async function runImport(archive: Buffer): Promise<ImportResult> {
  const admin = getAdminSupabase();
  if (!admin) throw new ImportRefused("import needs the service role key", 503);

  let entries;
  try {
    entries = readZip(archive);
  } catch (e) {
    throw new ImportRefused(
      `That file is not a Sojourn export (${e instanceof Error ? e.message : e}).`,
      400,
    );
  }
  const byName = new Map(entries.map((e) => [e.name, e.data]));

  const manifestRaw = byName.get("manifest.json");
  if (!manifestRaw) {
    throw new ImportRefused("That archive has no manifest.json — not an export.", 400);
  }
  let manifest: ExportManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestRaw));
  } catch {
    throw new ImportRefused("The archive's manifest.json is not readable.", 400);
  }
  if (!canImport(manifest.formatVersion)) {
    throw new ImportRefused(
      `That export was written by a newer Sojourn (format ${manifest.formatVersion}). ` +
        `Update this instance first — importing it here would drop whatever this ` +
        `version does not know about.`,
      409,
    );
  }

  // Read and validate EVERY table before writing anything.
  //
  // This parse used to sit inside the insert loop, unguarded, below
  // assertEmpty. A malformed `data/<table>.json` in an otherwise-valid archive
  // therefore threw a raw SyntaxError halfway through — after earlier tables
  // had already been inserted. The route turns a non-ImportRefused throw into a
  // flat `{"error":"import failed"}` 500, naming neither the table nor the fact
  // that anything had been written; and because the database was no longer
  // empty, assertEmpty then refused the retry. The operator was locked out of
  // the only recovery path the feature has, on the worst day they were having.
  //
  // The insert-error branch below already reasoned about exactly this ("a
  // partial import that carries on is a journal nobody can trust the shape
  // of"), which makes the parse an oversight rather than a decision.
  //
  // Parsing first also means a corrupt archive is refused with the database
  // untouched, so the retry is still available.
  const parsed = new Map<string, Record<string, unknown>[]>();
  for (const table of EXPORTED_TABLES) {
    const raw = byName.get(`data/${table}.json`);
    if (!raw) {
      // An older export legitimately predates a table. Absent is not empty, but
      // it is also not an error.
      parsed.set(table, []);
      continue;
    }
    let rows: unknown;
    try {
      rows = JSON.parse(new TextDecoder().decode(raw));
    } catch (e) {
      throw new ImportRefused(
        `data/${table}.json is not readable JSON (${e instanceof Error ? e.message : e}). ` +
          `Nothing has been imported.`,
        400,
      );
    }
    if (!Array.isArray(rows)) {
      throw new ImportRefused(
        `data/${table}.json is not a list of rows. Nothing has been imported.`,
        400,
      );
    }
    parsed.set(table, rows as Record<string, unknown>[]);
  }

  // Checked as late as possible before the first write, and this is the guard
  // the whole feature rests on.
  await assertEmpty(admin);

  const tables: Record<string, number> = {};
  for (const table of EXPORTED_TABLES) {
    let rows = parsed.get(table) ?? [];
    if (rows.length === 0) {
      tables[table] = 0;
      continue;
    }
    if (table === "comments") rows = parentsFirst(rows);

    const { error } = await admin.from(table).insert(rows);
    if (error) {
      // Stop at the first failure, like the migration runner: a partial import
      // that carries on is a journal nobody can trust the shape of.
      throw new ImportRefused(
        `Importing ${table} failed after ${Object.values(tables).reduce((a, b) => a + b, 0)} ` +
          `row(s) in earlier tables: ${error.message}`,
        422,
      );
    }
    tables[table] = rows.length;
  }

  let photos = 0;
  const photosFailed: string[] = [];
  for (const [name, data] of byName) {
    if (!name.startsWith("photos/")) continue;
    const path = name.slice("photos/".length);
    const { error } = await admin.storage
      .from("photos")
      .upload(path, data, { upsert: true, contentType: contentTypeFor(path) });
    if (error) photosFailed.push(path);
    else photos++;
  }

  return {
    tables,
    photos,
    photosFailed,
    from: {
      sojournVersion: manifest.sojournVersion,
      createdAt: manifest.createdAt,
      siteName: manifest.siteName,
    },
  };
}

/**
 * Storage keeps whatever content type it is told, and the browser believes it.
 * Uploading every photograph as application/octet-stream makes them download
 * instead of display.
 */
function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    gif: "image/gif",
    heic: "image/heic",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
  };
  return types[ext] ?? "application/octet-stream";
}
