import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildZip } from "@/lib/backup/zip";

// The ZIP writer is hand-rolled, so asserting on its own bytes only proves it
// is self-consistent. This hands the archive to CPython's `zipfile` — a strict
// reader nobody here wrote — and asks it to verify every CRC and hand the
// contents back.
//
// Skipped when python3 is unavailable rather than failing: the unit tests pin
// the format, and a missing interpreter is not a defect in the archive.
function hasPython(): boolean {
  try {
    execFileSync("python3", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.runIf(hasPython())("archives open in a reader that did not write them", () => {
  it("round-trips names, bytes and CRCs through CPython's zipfile", () => {
    const dir = mkdtempSync(join(tmpdir(), "sojourn-zip-"));
    const path = join(dir, "export.zip");
    try {
      const enc = (s: string) => new TextEncoder().encode(s);
      // A non-ASCII name and a nested path, because those are what break naive
      // writers — and photo captions in this app are frequently German.
      const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 250]);
      writeFileSync(
        path,
        buildZip([
          { name: "manifest.json", data: enc('{"version":1}') },
          { name: "photos/Binghöhle.jpg", data: photo },
          { name: "data/posts.json", data: enc("[]") },
        ]),
      );

      // Written to a file rather than passed with -c, and kept pure ASCII: a
      // non-ASCII argument is re-encoded by the Windows console before Python
      // sees it, which fails as a mangled *source* file and looks alarmingly
      // like the archive is at fault. Names come back through JSON instead.
      const script = join(dir, "check.py");
      writeFileSync(
        script,
        [
          "import zipfile, json, sys",
          "z = zipfile.ZipFile(sys.argv[1])",
          "names = z.namelist()",
          "print(json.dumps({",
          "  'bad': z.testzip(),",  // the first entry whose CRC fails, or None
          "  'names': names,",
          "  'photo': list(z.read(names[1])),",
          "  'manifest': z.read('manifest.json').decode(),",
          "}))",
        ].join("\n"),
      );
      const out = execFileSync("python3", [script, path], { encoding: "utf8" });

      const result = JSON.parse(out) as {
        bad: string | null;
        names: string[];
        photo: number[];
        manifest: string;
      };

      expect(result.bad, "a CRC did not match").toBeNull();
      expect(result.names).toEqual([
        "manifest.json",
        "photos/Binghöhle.jpg",
        "data/posts.json",
      ]);
      expect(result.photo).toEqual([...photo]);
      expect(result.manifest).toBe('{"version":1}');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("produces an empty archive a reader still accepts", () => {
    const dir = mkdtempSync(join(tmpdir(), "sojourn-zip-"));
    const path = join(dir, "empty.zip");
    try {
      writeFileSync(path, buildZip([]));
      const out = execFileSync(
        "python3",
        ["-c", "import zipfile,sys;print(len(zipfile.ZipFile(sys.argv[1]).namelist()))", path],
        { encoding: "utf8" },
      );
      expect(out.trim()).toBe("0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// The other direction: archives we did not write, which is what an import
// actually receives. People unzip an export to look inside and re-zip it, and
// their operating system deflates on the way out.
describe.runIf(hasPython())("reading archives written elsewhere", () => {
  function pythonZip(dir: string, compression: string): string {
    const path = join(dir, `${compression}.zip`);
    const script = join(dir, `make-${compression}.py`);
    writeFileSync(
      script,
      [
        "import zipfile, sys",
        `z = zipfile.ZipFile(sys.argv[1], 'w', zipfile.${compression})`,
        // Highly compressible, so a deflated entry really is deflated.
        "z.writestr('data/posts.json', '[' + '{\"a\":1},' * 400 + '{\"a\":1}]')",
        "z.writestr('photos/Bing' + chr(246) + 'hle.jpg', bytes([255,216,255,224,1,2,3]))",
        "z.close()",
      ].join("\n"),
    );
    execFileSync("python3", [script, path]);
    return path;
  }

  it("reads a stored archive", async () => {
    const { readZip } = await import("@/lib/backup/zip");
    const dir = mkdtempSync(join(tmpdir(), "sojourn-zip-"));
    try {
      const entries = readZip(readFileSync(pythonZip(dir, "ZIP_STORED")));
      expect(entries.map((e) => e.name)).toEqual([
        "data/posts.json",
        "photos/Bingöhle.jpg",
      ]);
      expect([...entries[1].data]).toEqual([255, 216, 255, 224, 1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reads a deflated archive, which we never write but do receive", async () => {
    const { readZip } = await import("@/lib/backup/zip");
    const dir = mkdtempSync(join(tmpdir(), "sojourn-zip-"));
    try {
      const entries = readZip(readFileSync(pythonZip(dir, "ZIP_DEFLATED")));
      const posts = entries.find((e) => e.name === "data/posts.json")!;
      expect(new TextDecoder().decode(posts.data)).toMatch(/^\[\{"a":1\},/);
      expect([...entries[1].data]).toEqual([255, 216, 255, 224, 1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("round-trips our own archive through our own reader", async () => {
    const { buildZip, readZip } = await import("@/lib/backup/zip");
    const data = new Uint8Array([1, 2, 3, 250, 0, 255]);
    const [entry] = readZip(buildZip([{ name: "photos/ä.jpg", data }]));
    expect(entry.name).toBe("photos/ä.jpg");
    expect([...entry.data]).toEqual([...data]);
  });

  it("refuses something that is not an archive at all", async () => {
    const { readZip } = await import("@/lib/backup/zip");
    expect(() => readZip(Buffer.from("this is a photograph, not a backup"))).toThrow(
      /not a ZIP/,
    );
  });
});
