import { describe, it, expect } from "vitest";
import { assignLeftoverPhotos } from "@/lib/ai/outline-plan";

const sec = (photo_ids: string[]) => ({ heading: "", photo_ids });

describe("assignLeftoverPhotos", () => {
  it("leaves fully-placed plans untouched", () => {
    const out = assignLeftoverPhotos([sec(["a", "b"]), sec(["c"])], ["a", "b", "c"]);
    expect(out.map((s) => s.photo_ids)).toEqual([["a", "b"], ["c"]]);
  });

  it("attaches a stray to the section of its nearest earlier neighbour", () => {
    // order a,b,c,d ; b unplaced ; a in s0, c/d in s1 → b joins s0
    const out = assignLeftoverPhotos([sec(["a"]), sec(["c", "d"])], ["a", "b", "c", "d"]);
    expect(out.map((s) => s.photo_ids)).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("falls back to the later neighbour when nothing precedes it", () => {
    // order x,y ; x unplaced ; y in s1 → x joins s1
    const out = assignLeftoverPhotos([sec([]), sec(["y"])], ["x", "y"]);
    expect(out.map((s) => s.photo_ids)).toEqual([[], ["y", "x"]]);
  });

  it("does not mutate the input sections", () => {
    const input = [sec(["a"]), sec(["c"])];
    assignLeftoverPhotos(input, ["a", "b", "c"]);
    expect(input.map((s) => s.photo_ids)).toEqual([["a"], ["c"]]);
  });
});
