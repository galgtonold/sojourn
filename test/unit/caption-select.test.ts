import { describe, it, expect } from "vitest";
import { selectCaptionTargets } from "@/lib/ai/caption-select";

const photo = (
  id: string,
  o: { ai_description?: string | null; place_name?: string | null; caption?: string | null } = {},
) => ({ id, ai_description: null, place_name: null, caption: null, ...o });

describe("selectCaptionTargets", () => {
  it("keeps only photos with a description or a place name", () => {
    const out = selectCaptionTargets(
      [
        photo("desc", { ai_description: "a hill" }),
        photo("place", { place_name: "Oslo" }),
        photo("nothing"),
      ],
      { onlyEmpty: false },
    );
    expect(out.map((p) => p.id)).toEqual(["desc", "place"]);
  });

  it("onlyEmpty keeps just the uncaptioned ones", () => {
    const out = selectCaptionTargets(
      [
        photo("empty", { place_name: "Oslo" }),
        photo("done", { place_name: "Bergen", caption: "Already set" }),
      ],
      { onlyEmpty: true },
    );
    expect(out.map((p) => p.id)).toEqual(["empty"]);
  });

  it("with onlyEmpty false it re-captions ones that already have a caption", () => {
    const out = selectCaptionTargets(
      [photo("done", { place_name: "Bergen", caption: "Already set" })],
      { onlyEmpty: false },
    );
    expect(out.map((p) => p.id)).toEqual(["done"]);
  });

  it("caps the number of targets", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      photo(`p${i}`, { place_name: "x" }),
    );
    expect(selectCaptionTargets(many, { onlyEmpty: false })).toHaveLength(40);
    expect(selectCaptionTargets(many, { onlyEmpty: false, limit: 5 })).toHaveLength(5);
  });

  it("restricts to an explicit id set when given", () => {
    const out = selectCaptionTargets(
      [
        photo("a", { place_name: "Oslo", caption: "draft a" }),
        photo("b", { place_name: "Bergen", caption: "draft b" }),
        photo("c", { place_name: "Tromsø" }),
      ],
      { onlyEmpty: false, ids: ["a", "c"] },
    );
    expect(out.map((p) => p.id)).toEqual(["a", "c"]);
  });
});
