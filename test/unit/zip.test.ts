import { describe, it, expect } from "vitest";
import { buildZip, crc32 } from "@/lib/backup/zip";

// A ZIP written by hand is only correct if something that did not write it can
// read it. These pin the bytes; test/e2e/zip-interop checks the archive against
// a real reader, which is the assertion that actually matters.

const AT = new Date(Date.UTC(2026, 7, 4, 12, 0, 0));
const bytes = (s: string) => new TextEncoder().encode(s);

describe("crc32", () => {
  it("matches the published vector for '123456789'", () => {
    // The standard CRC-32/ISO-HDLC check value. If this is wrong, every entry
    // in every archive is wrong, and most readers will say so only vaguely.
    expect(crc32(bytes("123456789")) >>> 0).toBe(0xcbf43926);
  });

  it("is zero for no bytes at all", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("buildZip", () => {
  it("starts with the local file header signature", () => {
    const zip = buildZip([{ name: "a.txt", data: bytes("hello") }], AT);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
  });

  it("ends with the end-of-central-directory record", () => {
    const zip = buildZip([{ name: "a.txt", data: bytes("hello") }], AT);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
  });

  it("counts its entries in both places the format asks for", () => {
    const zip = buildZip(
      [
        { name: "a.txt", data: bytes("one") },
        { name: "b.txt", data: bytes("two") },
      ],
      AT,
    );
    const eocd = zip.length - 22;
    expect(zip.readUInt16LE(eocd + 8)).toBe(2);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
  });

  it("marks names as UTF-8, so an umlaut survives the trip", () => {
    const zip = buildZip([{ name: "Binghöhle.txt", data: bytes("x") }], AT);
    // Bit 11 of the general purpose flags.
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800);
    expect(zip.includes(Buffer.from("Binghöhle.txt", "utf8"))).toBe(true);
  });

  it("stores rather than deflates, so sizes agree", () => {
    const data = bytes("photographs are already compressed");
    const zip = buildZip([{ name: "a.bin", data }], AT);
    expect(zip.readUInt16LE(8)).toBe(0); // method 0
    expect(zip.readUInt32LE(18)).toBe(data.length); // compressed
    expect(zip.readUInt32LE(22)).toBe(data.length); // uncompressed
  });

  it("writes an archive with no entries at all", () => {
    // An instance with nothing in it still has to produce a valid file rather
    // than a truncated one.
    const zip = buildZip([], AT);
    expect(zip.length).toBe(22);
    expect(zip.readUInt32LE(0)).toBe(0x06054b50);
  });

  it("clamps dates before 1980, which the format cannot represent", () => {
    // A negative year field makes some readers reject the whole archive.
    const zip = buildZip([{ name: "a", data: bytes("x") }], new Date(Date.UTC(1970, 0, 1)));
    const dosDate = zip.readUInt16LE(12);
    expect(dosDate >>> 9).toBe(0); // 1980 + 0
  });
});
