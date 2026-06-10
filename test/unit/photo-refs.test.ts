import { describe, expect, it } from "vitest";
import { invalidPhotoRefs } from "@/lib/photo-refs";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const FAKE = "99999999-9999-4999-8999-999999999999";

describe("invalidPhotoRefs", () => {
  it("flags photo refs that aren't in the allowed set", () => {
    const body = `Intro\n[photo:${A}]\nmore\n[photo:${FAKE}]\n`;
    expect(invalidPhotoRefs(body, [A, B])).toEqual([FAKE]);
  });

  it("accepts allowed ids and bare integer (index) refs", () => {
    expect(invalidPhotoRefs(`[photo:${A}] [photo:${B}] [photo:2]`, [A, B])).toEqual(
      [],
    );
  });

  it("dedupes a repeated invented ref", () => {
    expect(invalidPhotoRefs(`[photo:${FAKE}] x [photo:${FAKE}]`, [A])).toEqual([
      FAKE,
    ]);
  });

  it("returns [] when there are no photo tags", () => {
    expect(invalidPhotoRefs("plain prose, no tags", [A])).toEqual([]);
  });
});
