import { inflateRawSync } from "node:zlib";

// A ZIP writer and reader, in about a hundred lines and no dependencies.
//
// Why hand-rolled: the app image carries `tar` and nothing else — no `zip`, no
// `pg_dump`, no `psql` — and an export people can open by double-clicking on
// whatever machine they moved to is worth more than one that needs a tool
// installed first. The format is old and small enough to write correctly.
//
// Stored, never deflated. An export is mostly photographs, which are already
// compressed; deflating a JPEG spends CPU to make it very slightly larger. The
// JSON alongside it would compress well and is a rounding error next to the
// pictures.
//
// Limits, stated rather than discovered: no Zip64, so this tops out at 4 GB per
// entry and 4 GB total, and entry names are written as UTF-8 with the language
// flag set. `buildZip` returns one Buffer, so an export also has to fit in
// memory — see the route for how that bounds what we are willing to include.

/** CRC-32 (IEEE), the checksum ZIP entries carry. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; data: Uint8Array };

/**
 * The largest single entry we will inflate.
 *
 * A deflated entry declares how big it becomes, but the declaration is part of
 * the file — so it is a claim, not a fact, and inflating without a ceiling means
 * a few kilobytes of upload can ask for gigabytes of memory. Forty megabytes of
 * zeros compresses to under two hundred kilobytes; the box this runs on is a
 * 2 GB VPS already mostly given over to Postgres.
 *
 * Above what a photograph can be (the all-in-one caps uploads at 50 MB), well
 * under what would hurt.
 */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

/**
 * And a ceiling on the whole archive once unpacked.
 *
 * The per-entry limit alone is not enough: readZip holds every entry in memory
 * at once, so an archive of a thousand entries each just under the per-entry
 * cap is the same attack with more steps. Deflate reaches about 1000:1 on
 * repetitive data, so a 250 MB upload — the most the import route accepts —
 * could otherwise ask for far more than any host has.
 */
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;

/**
 * Is this a name we are willing to write anywhere?
 *
 * The import turns `photos/<name>` into a storage path, so an entry called
 * `photos/../../x` becomes `../../x` — uploaded with the service role and
 * upsert:true, wherever that resolves to. That is zip-slip, and it comes free
 * with the format: nothing stops an archive naming a path outside itself.
 *
 * Refused rather than sanitised. A name that tries to climb out is either
 * hostile or broken, and quietly rewriting it to something safe would import
 * someone's photograph under a path they never chose.
 */
export function isSafeEntryName(name: string): boolean {
  if (name.length === 0 || name.length > 512) return false;
  // Backslashes are separators on the systems that will unpack this, and a
  // control character in a path is either an attack or a corrupt archive.
  // Written out rather than as one regex: a character class holding NUL is
  // exactly the kind of literal that gets mangled in transit and then silently
  // matches nothing.
  const BACKSLASH = 0x5c;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 0x20 || c === BACKSLASH) return false;
  }
  // Absolute, or a Windows drive.
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) return false;
  return !name.split("/").includes("..");
}

/**
 * Read an archive back.
 *
 * Driven from the central directory rather than by scanning for local headers:
 * the directory is the authoritative index, and scanning happily "finds" the
 * bytes of a file that merely contains a header signature — an export full of
 * photographs contains a lot of arbitrary bytes.
 *
 * Handles stored and deflated entries. We only ever write stored, but the file
 * someone hands back has often been unzipped and re-zipped by their operating
 * system on the way, which compresses.
 */
export function readZip(buf: Buffer): ZipEntry[] {
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("not a ZIP archive (no end-of-central-directory)");

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let unpacked = 0;

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // The local header's own name/extra lengths are what locate the data; the
    // central directory's extra field is frequently a different size.
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    if (!isSafeEntryName(name)) {
      throw new Error(`unsafe path in archive: ${JSON.stringify(name)}`);
    }

    let data: Uint8Array;
    if (method === 0) {
      if (raw.length !== compressedSize) {
        throw new Error(`truncated entry: ${name}`);
      }
      data = new Uint8Array(raw);
    } else if (method === 8) {
      // Bounded, because the declared size is part of the file being checked.
      data = new Uint8Array(
        inflateRawSync(raw, { maxOutputLength: MAX_ENTRY_BYTES }),
      );
    } else {
      throw new Error(`unsupported compression (method ${method}) for ${name}`);
    }

    unpacked += data.byteLength;
    if (unpacked > MAX_TOTAL_BYTES) {
      throw new Error(
        `archive unpacks to more than ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB`,
      );
    }

    // Directory entries are zero-length names ending in "/" — nothing to carry.
    if (!name.endsWith("/")) entries.push({ name, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * The end-of-central-directory record, found by scanning backwards.
 *
 * It is last, but a trailing comment can push it up to 64 KB from the end, so
 * the scan is bounded by that rather than assuming it sits exactly at -22.
 */
function findEocd(buf: Buffer): number {
  const earliest = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= earliest; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/**
 * MS-DOS date/time, which is what ZIP stores: two-second resolution, and no
 * years before 1980. Anything earlier is clamped rather than wrapped, because a
 * negative year field makes some readers reject the whole archive.
 */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/**
 * Pack entries into a ZIP archive.
 *
 * `at` stamps every entry, and is a parameter rather than `new Date()` so the
 * tests can assert on bytes.
 */
export function buildZip(entries: ZipEntry[], at: Date = new Date()): Buffer {
  const { time, date } = dosDateTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const sum = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(0x0800, 6); // flags: names are UTF-8
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory header
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // where the local header sits
    name.copy(central, 46);

    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16); // where the central directory starts
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, ...centrals, end]);
}
