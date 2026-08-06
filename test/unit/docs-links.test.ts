import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, posix } from "node:path";

// The README used to be one 560-line file, so every cross-reference was an
// in-page anchor that could not break. Splitting it into README + docs/ turned
// forty of them into paths between files, and a broken relative link in a
// GitHub-rendered README is invisible to everyone who wrote it and immediate to
// everyone who didn't.
//
// Same guard as .env.example and docker-compose have, for the same reason: a
// surface nothing checks drifts silently, and the drift only ever shows up as
// somebody else's confusing afternoon.
//
// `docs/internal/` is gitignored — audits and QA passes that exist on the
// maintainer's disk and nowhere else. Linking to one from a tracked file would
// pass here and 404 for every reader, so it is rejected by name.

const ROOTS = ["README.md", "CONTRIBUTING.md", "SECURITY.md", "docs"];
const SKIP_DIRS = new Set(["internal", "superpowers", "screenshots"]);

function markdownFiles(): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p)) {
        if (!SKIP_DIRS.has(e)) walk(join(p, e));
      }
    } else if (p.endsWith(".md")) {
      out.push(p.split("\\").join("/"));
    }
  };
  for (const r of ROOTS) if (existsSync(r)) walk(r);
  return out;
}

/** GitHub's heading -> anchor rule: lowercase, drop punctuation, spaces to `-`. */
function slug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/[^a-z0-9 \-]/g, "")
    .trim()
    .replace(/ /g, "-");
}

function anchorsOf(file: string): Set<string> {
  const seen = new Map<string, number>();
  const out = new Set<string>();
  for (const m of readFileSync(file, "utf8").matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) {
    const base = slug(m[1]);
    // GitHub disambiguates a repeated heading by appending -1, -2, …
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.add(n === 0 ? base : `${base}-${n}`);
  }
  return out;
}

/** Every [text](target) in `file`, minus external and anchor-only-to-self URLs. */
function linksOf(file: string): string[] {
  const body = readFileSync(file, "utf8");
  return [...body.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1])
    .filter((t) => !/^(https?:|mailto:|#!)/.test(t));
}

const FILES = markdownFiles();

describe("documentation links resolve", () => {
  it("found the docs to check", () => {
    // Guard the guard: an empty list would make everything below vacuous.
    expect(FILES).toContain("README.md");
    expect(FILES).toContain("docs/deployment.md");
    expect(FILES.length).toBeGreaterThanOrEqual(6);
  });

  it.each(FILES)("%s points only at files that exist", (file) => {
    for (const link of linksOf(file)) {
      const [path] = link.split("#");
      if (!path) continue; // same-page anchor, checked below
      const target = posix.normalize(posix.join(dirname(file), path));
      expect(existsSync(target), `${file} links to missing ${target}`).toBe(
        true,
      );
    }
  });

  it.each(FILES)("%s points only at headings that exist", (file) => {
    for (const link of linksOf(file)) {
      const [path, anchor] = link.split("#");
      if (!anchor) continue;
      const target = path
        ? posix.normalize(posix.join(dirname(file), path))
        : file;
      if (!existsSync(target) || !target.endsWith(".md")) continue;
      expect(
        anchorsOf(target),
        `${file} links to #${anchor}, which is not a heading in ${target}`,
      ).toContain(anchor);
    }
  });

  it.each(FILES)("%s does not link into gitignored docs/internal", (file) => {
    for (const link of linksOf(file)) {
      expect(link, `${file} links to a file that is not in the repo`).not.toMatch(
        /docs\/internal|(^|\/)internal\//,
      );
    }
  });
});
