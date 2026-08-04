// Server-only: gather everything portable about this instance into one archive.
//
// Read through the service-role Supabase client rather than a direct Postgres
// connection, deliberately: production has no DATABASE_URL at all, and the
// whole point of this feature is moving an instance to a different host. An
// export that only works where you already have psql is not the one you need.
//
// What this is NOT: a disaster-recovery dump. There is no `auth` schema here,
// no roles, no extensions, no RLS policies — the app cannot read those through
// PostgREST, and shipping half of them would be worse than shipping none. The
// archive restores INTO a working, empty Sojourn, which is what moving hosts
// and rebuilding both look like. scripts/backup.sh is the bare-metal path.
import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { env } from "@/lib/env";
import { SOJOURN_VERSION } from "@/lib/version";
import { buildZip, type ZipEntry } from "@/lib/backup/zip";
import {
  EXPORTED_TABLES,
  EXCLUDED_TABLES,
  EXPORT_FORMAT_VERSION,
  type ExportManifest,
} from "@/lib/backup/manifest";

/**
 * How much photography we are willing to hold in memory at once.
 *
 * The archive is assembled as one Buffer, so this is a real ceiling rather than
 * a policy — and the machines this runs on are 2 GB VPSes already giving most
 * of themselves to Postgres. Above it we refuse and name the tool that streams
 * instead, rather than quietly shipping an archive missing half the pictures.
 */
const DEFAULT_LIMIT_BYTES = 200 * 1024 * 1024;

export function exportLimitBytes(): number {
  const raw = Number(process.env.EXPORT_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMIT_BYTES;
}

export class ExportTooLarge extends Error {
  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(
      `This instance holds ${Math.round(bytes / 1024 / 1024)} MB of photographs, ` +
        `over the ${Math.round(limit / 1024 / 1024)} MB the in-app export can hold in memory. ` +
        `Use scripts/backup.sh, which streams to disk instead.`,
    );
    this.name = "ExportTooLarge";
  }
}

const BUCKET = "photos";

/** Every distinct storage path the photo rows reference. */
function photoPaths(rows: Record<string, unknown>[]): string[] {
  const paths = new Set<string>();
  for (const row of rows) {
    for (const key of ["storage_path", "poster_path"]) {
      const v = row[key];
      // Videos have a poster, stills do not; both live in the same bucket.
      if (typeof v === "string" && v.length > 0) paths.add(v);
    }
  }
  return [...paths].sort();
}

export async function buildExport(at: Date = new Date()): Promise<{
  zip: Buffer;
  manifest: ExportManifest;
}> {
  const admin = getAdminSupabase();
  if (!admin) throw new Error("export needs the service role key");

  const entries: ZipEntry[] = [];
  const tables: Record<string, number> = {};
  let photoRows: Record<string, unknown>[] = [];

  for (const table of EXPORTED_TABLES) {
    const { data, error } = await admin.from(table).select("*");
    if (error) throw new Error(`could not read ${table}: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    tables[table] = rows.length;
    if (table === "photos") photoRows = rows;
    entries.push({
      name: `data/${table}.json`,
      // Pretty-printed: an export is also the thing someone opens to check what
      // they have, and to hand-fix a row before importing it somewhere else.
      data: new TextEncoder().encode(JSON.stringify(rows, null, 2)),
    });
  }

  // Checked as we go, not up front. `photos` records dimensions but not file
  // size, and the storage API only reports sizes by walking every prefix — so
  // there is no cheap way to know the total before fetching it. The running
  // total below is the real ceiling; it just means we download up to the limit
  // before refusing rather than refusing immediately.
  const paths = photoPaths(photoRows);
  const limit = exportLimitBytes();

  const missing: string[] = [];
  let bytes = 0;
  for (const path of paths) {
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) {
      // Recorded, not thrown. A photo whose file has already gone is a fact
      // about this instance, and the export is more useful than the failure.
      missing.push(path);
      continue;
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    bytes += buf.byteLength;
    if (bytes > limit) throw new ExportTooLarge(bytes, limit);
    entries.push({ name: `photos/${path}`, data: buf });
  }

  const manifest: ExportManifest = {
    formatVersion: EXPORT_FORMAT_VERSION,
    sojournVersion: SOJOURN_VERSION,
    createdAt: at.toISOString(),
    siteName: env.siteName,
    tables,
    photos: { files: paths.length - missing.length, bytes, missing },
    notIncluded: EXCLUDED_TABLES,
  };

  // First in the archive, so it is the first thing a reader sees — including
  // the list of what deliberately is not here.
  entries.unshift({
    name: "manifest.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });
  entries.unshift({
    name: "README.txt",
    data: new TextEncoder().encode(readmeFor(manifest)),
  });

  return { zip: buildZip(entries, at), manifest };
}

/**
 * A plain-text note inside the archive.
 *
 * Someone opening this is usually rebuilding after something went wrong, quite
 * possibly on a machine that no longer has the documentation.
 */
function readmeFor(m: ExportManifest): string {
  const rows = Object.entries(m.tables)
    .map(([t, n]) => `  ${String(n).padStart(6)}  ${t}`)
    .join("\n");
  return `Sojourn export
==============

Written ${m.createdAt} by Sojourn ${m.sojournVersion} ("${m.siteName}").

  data/     one JSON file per table, in the order they must be imported
  photos/   the photograph and video files themselves
${rows}

  ${m.photos.files} photo file(s), ${Math.round(m.photos.bytes / 1024)} KB${
    m.photos.missing.length
      ? `\n  ${m.photos.missing.length} file(s) referenced by a row but missing from storage`
      : ""
  }

To restore, import this file into a NEW, EMPTY Sojourn:
Settings -> Backup -> Import. It will refuse if that instance already has
content, because merging two journals is not something software should guess at.

NOT in this archive, on purpose:
${Object.entries(m.notIncluded)
  .map(([t, why]) => `  ${t} — ${why}`)
  .join("\n")}

Accounts and passwords are not here either: they live in Supabase's own auth
schema, which this app cannot read. After importing, create your owner account
through first-run setup as usual. For a copy that includes accounts, use
scripts/backup.sh on the machine itself.
`;
}
