import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { checkOverlay, upstreamImages, MIRROR_PREFIX } from "../../scripts/mirror-images.mjs";

// CI runs the all-in-one stack from a private GHCR mirror, because
// public.ecr.aws throttles anonymous pulls per source IP and a runner shares
// its IP with the whole fleet.
//
// The risk that buys is drift. Bump Postgres in docker-compose.all-in-one.yml,
// forget docker-compose.ci.yml, and CI keeps testing migrations against the old
// server while production runs the new one — green the whole way, and the
// difference only shows up somewhere that is not CI. Nothing about editing one
// file announces the other, so this is the announcement.

describe("the CI mirror matches the stack it mirrors", () => {
  it("pins every upstream image, at the same tag", () => {
    expect(
      checkOverlay().join("\n"),
      "docker-compose.ci.yml has drifted from docker-compose.all-in-one.yml. " +
        "Run the 'Mirror upstream images' workflow so the new tag exists, then " +
        "update the overlay.",
    ).toBe("");
  });

  it("finds the images at all — a silent empty list would pass everything", () => {
    const images = upstreamImages();
    expect(images.length).toBeGreaterThanOrEqual(5);
    for (const image of images) {
      expect(image.source).toMatch(/^public\.ecr\.aws\//);
      expect(image.destination).toMatch(new RegExp(`^${MIRROR_PREFIX}/`));
      expect(image.tag, `${image.name} has no tag`).toBeTruthy();
    }
  });

  it("leaves the file people install with pointing at upstream", () => {
    // The mirror is a CI convenience. If it ever reaches the published compose
    // file, every self-hosted install starts pulling from a private package
    // they cannot read, and the failure is a login prompt for a registry they
    // have never heard of.
    const published = readFileSync("docker-compose.all-in-one.yml", "utf8");
    expect(published).not.toContain(MIRROR_PREFIX);
  });
});
