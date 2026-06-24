// test/harness/fixture.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadFixture } from "../../eval/harness/fixture";

const dir = join(process.cwd(), "eval/sample/sample-trip");

describe("loadFixture", () => {
  it("loads the sample into a seeded db + params", () => {
    const fx = loadFixture(dir);
    expect(fx.lang).toBe("de");
    expect(fx.postId).toBeTruthy();
    expect(fx.photoIds.length).toBe(1);
    const photo = fx.db.photos[0];
    expect(String(photo.url)).toMatch(/^data:image\/jpe?g;base64,/); // base64 data URL
    expect(photo.lat).toBeTypeOf("number");
    expect(fx.db.posts[0].ai_notes).toBe(fx.notes ?? null);
    expect(fx.reference).toContain("Beispiel"); // from reference.md
  });
});

// loadFixture only base64-encodes the photo bytes, so a tiny stub file is fine.
function writeTempFixture(withTrack: boolean): string {
  const d = mkdtempSync(join(tmpdir(), "fx-"));
  mkdirSync(join(d, "photos"), { recursive: true });
  writeFileSync(join(d, "photos", "1.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const manifest: Record<string, unknown> = {
    slug: "t", lang: "en",
    trip: { title: "T", start_date: "2023-01-01" },
    photos: [{ file: "photos/1.jpg", lat: 1, lng: 2, taken_at: "2023-01-01T00:00:00Z" }],
  };
  if (withTrack) {
    manifest.track = "track.json";
    writeFileSync(join(d, "track.json"), JSON.stringify({
      name: "Test track", distance_m: 1234, started_at: "2023-01-01T08:00:00Z",
      geojson: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[2, 1], [2.1, 1.1]] } }] },
    }));
  }
  writeFileSync(join(d, "fixture.json"), JSON.stringify(manifest));
  return d;
}

describe("loadFixture track loading", () => {
  it("loads a track file into db.tracks, attached to the post", () => {
    const fx = loadFixture(writeTempFixture(true));
    expect(fx.trackPresent).toBe(true);
    expect(fx.db.tracks).toHaveLength(1);
    const tr = fx.db.tracks[0] as Record<string, unknown>;
    expect(tr.post_id).toBe(fx.postId);
    expect(tr.name).toBe("Test track");
    expect(tr.distance_m).toBe(1234);
    const geo = tr.geojson as { features: { geometry: { coordinates: number[][] } }[] };
    expect(geo.features[0].geometry.coordinates[0]).toEqual([2, 1]);
  });

  it("leaves db.tracks empty when no track is referenced", () => {
    const fx = loadFixture(writeTempFixture(false));
    expect(fx.trackPresent).toBe(false);
    expect(fx.db.tracks).toHaveLength(0);
  });
});
