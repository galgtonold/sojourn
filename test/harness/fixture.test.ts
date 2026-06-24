// test/harness/fixture.test.ts
import { describe, expect, it } from "vitest";
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
