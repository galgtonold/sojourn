import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// THIRD-PARTY-NOTICES.txt is a licence obligation, not documentation. Almost
// every dependency here — MIT, BSD, ISC, Apache-2.0 — permits redistribution
// only on the condition that its copyright notice travels with the code, and
// minification strips those banners out of the bundle. The file is how the
// condition is met.
//
// Which makes going stale the whole risk: add a dependency, forget
// `npm run notices`, and nothing looks wrong. Ship it and the condition is
// quietly unmet again.

const NOTICES = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8");
const LOCK = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages: Record<string, { version?: string; dev?: boolean }>;
};

function shipped(): { name: string; version: string }[] {
  const out: { name: string; version: string }[] = [];
  for (const [path, entry] of Object.entries(LOCK.packages)) {
    if (!path.startsWith("node_modules/") || entry.dev) continue;
    const at = path.lastIndexOf("node_modules/") + "node_modules/".length;
    out.push({ name: path.slice(at), version: entry.version ?? "?" });
  }
  return out;
}

describe("third-party notices", () => {
  it("names every package that actually ships", () => {
    const missing = shipped()
      .filter((p) => !NOTICES.includes(`${p.name}@${p.version}`))
      .map((p) => `${p.name}@${p.version}`);
    expect(
      missing,
      `THIRD-PARTY-NOTICES.txt is stale — run \`npm run notices\`. Missing: ${missing.slice(0, 10).join(", ")}`,
    ).toEqual([]);
  });

  it("lists nothing that was dropped from the tree", () => {
    // The mirror: a package removed from package.json but left in the notices
    // is a claim about what ships that stopped being true.
    const live = new Set(shipped().map((p) => `${p.name}@${p.version}`));
    const listed = [...NOTICES.matchAll(/^(@?[\w.-]+(?:\/[\w.-]+)?)@(\d[^\s—]*) — /gm)]
      .map((m) => `${m[1]}@${m[2]}`)
      .filter((n) => !live.has(n));
    expect(
      listed,
      `THIRD-PARTY-NOTICES.txt lists packages that no longer ship — run \`npm run notices\`.`,
    ).toEqual([]);
  });

  it("carries MapLibre's copyright, which the bundle strips", () => {
    // The concrete case that motivated this: maplibre-gl is BSD-3-Clause and
    // its banner does not survive the build.
    expect(NOTICES).toMatch(/maplibre-gl@\d/);
    // The copyright holder is the part BSD-3 requires to travel, so assert on
    // that rather than on a licence title MapLibre's file does not carry.
    expect(NOTICES).toContain("Copyright (c) 2023, MapLibre contributors");
    expect(NOTICES).toContain("Redistribution and use in source and binary forms");
  });

  it("accounts for libvips, which npm never installed and the image contains", () => {
    // sharp's prebuilt binaries embed LGPL libvips. Nothing in the dependency
    // tree says so, so the generator states it by hand — and this pins it.
    expect(NOTICES).toContain("libvips");
    expect(NOTICES).toMatch(/LGPL-3\.0/);
  });

  it("accounts for the typefaces, which next/font fetches at build time", () => {
    // Self-hosted into the build output, so they ship too — and neither shows
    // up in package-lock.
    expect(NOTICES).toContain("Inter");
    expect(NOTICES).toContain("Fraunces");
    expect(NOTICES).toMatch(/Open Font License/);
  });
});
