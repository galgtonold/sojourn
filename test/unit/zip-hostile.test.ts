import { describe, it, expect } from "vitest";
import { buildZip, readZip } from "@/lib/backup/zip";
import { deflateRawSync } from "node:zlib";

// readZip is the only parser in this codebase that runs on a file a person
// uploads. Everything else reads its own database. These are the attacks that
// come free with the format, and each one was possible when it was written.

const enc = (s: string) => new TextEncoder().encode(s);

describe("an archive that tries to escape its own folder", () => {
  // Zip-slip. The import turns `photos/<name>` into a storage path, so an entry
  // called `photos/../../x` becomes `../../x` and is uploaded — with the service
  // role, and with upsert:true — wherever that resolves to.
  for (const name of [
    "photos/../../escape.jpg",
    "photos/../outside.jpg",
    "../manifest.json",
    "/etc/passwd",
    // Escaped, so this really is a backslash: unescaped, `\.` is just `.` in
    // TypeScript and the case silently tests a perfectly safe name.
    "photos/..\\..\\escape.jpg",
    "photos/sub/../../../escape.jpg",
  ]) {
    it(`refuses ${JSON.stringify(name)}`, () => {
      const zip = buildZip([{ name, data: enc("x") }]);
      expect(() => readZip(zip)).toThrow(/unsafe|path/i);
    });
  }

  it("still accepts the names a real export contains", () => {
    const zip = buildZip([
      { name: "manifest.json", data: enc("{}") },
      { name: "data/posts.json", data: enc("[]") },
      { name: "photos/9f2c1a7e/Binghöhle.jpg", data: enc("x") },
    ]);
    expect(readZip(zip).map((e) => e.name)).toEqual([
      "manifest.json",
      "data/posts.json",
      "photos/9f2c1a7e/Binghöhle.jpg",
    ]);
  });
});

describe("an archive that is mostly air", () => {
  it("refuses an entry that expands out of all proportion", () => {
    // 80 MB of zeros deflates to a few KB, and sits over the per-entry ceiling.
    // Unbounded, inflating it is how a small upload takes down a 2 GB box that
    // is already mostly Postgres.
    const huge = Buffer.alloc(80 * 1024 * 1024);
    const squashed = deflateRawSync(huge);
    expect(squashed.length).toBeLessThan(200 * 1024);

    // Hand-build a deflated entry, since buildZip only ever stores.
    const name = Buffer.from("bomb.bin", "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflated
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(squashed.length, 18);
    local.writeUInt32LE(huge.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(squashed.length, 20);
    central.writeUInt32LE(huge.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(0, 42);
    name.copy(central, 46);

    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 8);
    end.writeUInt16LE(1, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(local.length + squashed.length, 16);

    const bomb = Buffer.concat([local, squashed, central, end]);
    expect(bomb.length).toBeLessThan(300 * 1024);
    expect(() => readZip(bomb)).toThrow();
  });
});

describe("an archive that is simply broken", () => {
  it("refuses a central directory pointing into nowhere", () => {
    const zip = buildZip([{ name: "a.txt", data: enc("hello") }]);
    // Point the entry's local header past the end of the file.
    const eocd = zip.length - 22;
    const centralStart = zip.readUInt32LE(eocd + 16);
    zip.writeUInt32LE(0x7fffff00, centralStart + 42);
    expect(() => readZip(zip)).toThrow();
  });

  it("refuses a truncated file rather than returning half an archive", () => {
    const zip = buildZip([{ name: "a.txt", data: enc("hello") }]);
    expect(() => readZip(zip.subarray(0, zip.length - 10))).toThrow();
  });
});
