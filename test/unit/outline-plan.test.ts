import { describe, it, expect } from "vitest";
import {
  assignLeftoverPhotos,
  reconcileOutline,
  type Outline,
} from "@/lib/ai/outline-plan";

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

const raw = (over: Partial<Outline> = {}): Outline => ({
  title: "T",
  excerpt: "E",
  location: null,
  lat: null,
  lng: null,
  cover_photo_id: null,
  sections: [],
  ...over,
});

describe("reconcileOutline", () => {
  it("keeps only real photo ids and overrides geo + date from inputs", () => {
    const out = reconcileOutline(
      raw({ sections: [{ heading: "H", beat: "", photo_ids: ["p1", "ghost"] }] }),
      {
        photoIds: ["p1"],
        interactionIds: [],
        geo: { lat: 57.5, lng: 12, place: "Kungsbacka" },
        date: "2026-07-11",
      },
    );
    expect(out.sections[0].photo_ids).toEqual(["p1"]);
    expect(out.location).toBe("Kungsbacka");
    expect(out.lat).toBe(57.5);
    expect(out.date).toBe("2026-07-11");
  });

  it("assigns each author interaction once (cross-section dedup + round-robin for dropped)", () => {
    const out = reconcileOutline(
      raw({
        sections: [
          { heading: "A", beat: "", photo_ids: [], interaction_refs: ["ix1"] },
          { heading: "B", beat: "", photo_ids: [], interaction_refs: ["ix1"] },
        ],
      }),
      { photoIds: [], interactionIds: ["ix1", "ix2"], geo: null, date: null },
    );
    const allRefs = out.sections.flatMap((s) => s.interaction_refs ?? []);
    expect(allRefs.filter((r) => r === "ix1")).toHaveLength(1); // not double-placed
    expect(allRefs).toContain("ix2"); // dropped by the model → round-robin home
  });

  it("caps invented interactions at 6", () => {
    const sections = Array.from({ length: 8 }, (_, i) => ({
      heading: `H${i}`,
      beat: "",
      photo_ids: [],
      interaction: { kind: "poll" as const, idea: `q${i}` },
    }));
    const out = reconcileOutline(raw({ sections }), {
      photoIds: [],
      interactionIds: [],
      geo: null,
      date: null,
    });
    expect(out.sections.filter((s) => s.interaction).length).toBe(6);
  });

  it("guarantees at least one section, with every photo placed", () => {
    const out = reconcileOutline(raw({ sections: [] }), {
      photoIds: ["p1", "p2"],
      interactionIds: [],
      geo: null,
      date: null,
    });
    expect(out.sections).toHaveLength(1);
    expect(out.sections[0].photo_ids).toEqual(["p1", "p2"]);
  });

  it("does not override location/coords the geo block lacks", () => {
    const out = reconcileOutline(
      raw({ location: "Typed", lat: 1, lng: 2, sections: [{ heading: "H", beat: "", photo_ids: [] }] }),
      { photoIds: [], interactionIds: [], geo: { lat: null, lng: null, place: null }, date: null },
    );
    expect(out.location).toBe("Typed");
    expect(out.lat).toBe(1);
  });
});
