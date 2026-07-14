import { describe, it, expect } from "vitest";
import {
  matchRefTags,
  stripRefTags,
  isIndexRef,
  resolveRef,
  refResolves,
  referencedPhotoIds,
} from "@/lib/references";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("matchRefTags", () => {
  it("finds photo and ask tags in document order with spans", () => {
    const body = `x [photo:${A}] y [ask:2] z`;
    const tags = matchRefTags(body);
    expect(tags.map((t) => [t.type, t.ref])).toEqual([
      ["photo", A],
      ["ask", "2"],
    ]);
    expect(body.slice(tags[0].start, tags[0].end)).toBe(`[photo:${A}]`);
  });

  it("does not match a stray-space (malformed) tag", () => {
    expect(matchRefTags("[photo: 2]")).toEqual([]);
    expect(matchRefTags("[photo:a b]")).toEqual([]);
  });
});

describe("stripRefTags", () => {
  it("removes tags but leaves prose and :::blocks", () => {
    expect(stripRefTags(`Hallo [photo:${A}] Welt`)).toBe("Hallo  Welt");
    expect(stripRefTags(`a [ask:1] b`, " ")).toBe("a   b");
    expect(stripRefTags(":::poll Q\n- a\n:::")).toBe(":::poll Q\n- a\n:::");
  });
});

describe("resolveRef / refResolves / isIndexRef", () => {
  const photos = [{ id: A }, { id: B }];

  it("resolves by exact id", () => {
    expect(resolveRef(B, photos)).toEqual({ id: B });
  });
  it("resolves a 1-based index", () => {
    expect(resolveRef("1", photos)).toEqual({ id: A });
    expect(resolveRef("2", photos)).toEqual({ id: B });
  });
  it("returns null for an out-of-range index or an unknown id", () => {
    expect(resolveRef("0", photos)).toBeNull();
    expect(resolveRef("3", photos)).toBeNull();
    expect(resolveRef("nope", photos)).toBeNull();
  });
  it("refResolves matches resolveRef's rule without the objects", () => {
    expect(refResolves(A, [A, B], 2)).toBe(true);
    expect(refResolves("2", [A, B], 2)).toBe(true);
    expect(refResolves("3", [A, B], 2)).toBe(false);
    expect(refResolves("x", [A, B], 2)).toBe(false);
  });
  it("isIndexRef only accepts bare integers", () => {
    expect(isIndexRef("2")).toBe(true);
    expect(isIndexRef(A)).toBe(false);
    expect(isIndexRef("2a")).toBe(false);
  });
});

describe("referencedPhotoIds", () => {
  it("collects inline photo ids (by id and by index), ignoring ask tags", () => {
    const photos = [{ id: A }, { id: B }] as never;
    const body = `[photo:${A}] and [photo:2] and [ask:1]`;
    expect(referencedPhotoIds(body, photos)).toEqual(new Set([A, B]));
  });
});
