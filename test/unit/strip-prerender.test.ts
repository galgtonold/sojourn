import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cacheBasename, staleArtefacts } from "../../scripts/strip-prerender.mjs";

// The bug this exists to prevent, in full: a build inside the Docker image has
// no database, so everything `next build` prerenders is empty and carries
// `https://build.invalid` as the Supabase URL handed to the browser. Next ships
// that HTML and serves it to the first visitor of every route.
//
// Measured on a real instance against a database with 43 published posts: the
// first request to /posts said "0 Geschichten"; the page was only correct on
// reload. Nothing errored, nothing logged, and every test passed.

describe("cacheBasename", () => {
  it("maps the site root to `index`, which is what Next calls it", () => {
    expect(cacheBasename("/")).toBe("index");
  });

  it("drops the leading slash for everything else", () => {
    expect(cacheBasename("/posts")).toBe("posts");
    expect(cacheBasename("/sitemap.xml")).toBe("sitemap.xml");
  });
});

describe("staleArtefacts", () => {
  // Shape taken from a real .next/prerender-manifest.json.
  const manifest = {
    routes: {
      "/": { initialRevalidateSeconds: 300 },
      "/posts": { initialRevalidateSeconds: 300 },
      "/sitemap.xml": { initialRevalidateSeconds: 3600 },
      "/robots.txt": { initialRevalidateSeconds: false as const },
      "/icon.svg": { initialRevalidateSeconds: false as const },
    },
  };

  it("discards every extension a route can be cached under", () => {
    // Pages write .html/.rsc/.meta; route handlers write .body/.meta. Missing
    // one leaves a stale copy behind that Next will happily keep serving.
    const files = staleArtefacts(manifest);
    for (const ext of [".html", ".rsc", ".meta", ".body"]) {
      expect(files, `no posts${ext}`).toContain(`posts${ext}`);
    }
  });

  it("uses `index` for the root route", () => {
    expect(staleArtefacts(manifest)).toContain("index.html");
    expect(staleArtefacts(manifest)).not.toContain(".html");
  });

  it("includes route handlers, not just pages", () => {
    expect(staleArtefacts(manifest)).toContain("sitemap.xml.body");
  });

  it("leaves permanently-static routes alone", () => {
    // Nothing here regenerates them, so removing their only copy would mean
    // rendering on every request forever.
    const files = staleArtefacts(manifest);
    expect(files.some((f) => f.startsWith("icon.svg"))).toBe(false);
    expect(files.some((f) => f.startsWith("robots.txt"))).toBe(false);
  });

  it("does nothing to a manifest with no prerendered routes", () => {
    expect(staleArtefacts({ routes: {} })).toEqual([]);
    expect(staleArtefacts({})).toEqual([]);
  });
});

// The strip only helps a route Next is willing to re-render. A data-backed
// route declared permanently static is never regenerated at all — which is how
// /sitemap.xml came to serve six localhost URLs and no posts to every crawler
// of every self-hosted instance, while production served twenty-one.
describe("routes that read the database or the site URL are not frozen", () => {
  for (const file of ["src/app/sitemap.ts", "src/app/robots.ts"]) {
    it(`${file} does not declare revalidate = false`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/export\s+const\s+revalidate\s*=\s*false/);
    });

    it(`${file} declares a numeric revalidate, so it is regenerated`, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toMatch(/export\s+const\s+revalidate\s*=\s*\d+/);
    });
  }
});

describe("the Dockerfile actually runs the strip", () => {
  // The script is only correct where it is invoked; the portable image is the
  // one build whose prerendered output is meaningless.
  it("strips after building", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toMatch(/strip-prerender\.mjs/);
  });
});
