import { describe, it, expect } from "vitest";
import {
  renderSegments,
  segmentsToBody,
  type RenderSegment,
  type Segment,
} from "@/lib/inline-editor";
import type { EditorInteraction } from "@/lib/story-editor";
import type { Photo } from "@/lib/types";

const photo = (id: string): Photo => ({
  id,
  url: `https://x/${id}.jpg`,
  caption: null,
  alt: null,
  width: 100,
  height: 100,
  blurhash: null,
  lat: null,
  lng: null,
  sort_order: 0,
});

const photos = [photo("p1"), photo("p2")];
const interactions: EditorInteraction[] = [
  { id: "i1", kind: "poll", question: "Which bird?", options: ["a", "b"], correct_index: null },
];

// A RenderSegment maps 1:1 to a serialization Segment.
const toSegment = (r: RenderSegment): Segment =>
  r.kind === "text" ? { type: "text", text: r.text } : { type: "token", token: r.token };

describe("segmentsToBody", () => {
  it("joins text and tokens with nothing added", () => {
    expect(
      segmentsToBody([
        { type: "text", text: "a " },
        { type: "token", token: "[photo:p1]" },
        { type: "text", text: " b" },
      ]),
    ).toBe("a [photo:p1] b");
  });
});

describe("renderSegments round-trip", () => {
  it("rebuilds the exact body from its render segments", () => {
    const body = "We left at dawn [photo:p1] and argued [ask:i1] about birds.";
    const segs = renderSegments(body, photos, interactions);
    expect(segmentsToBody(segs.map(toSegment))).toBe(body);
  });

  it("preserves an index-style token verbatim", () => {
    const body = "look [photo:1] here";
    const segs = renderSegments(body, photos, interactions);
    const chip = segs.find((s) => s.kind === "chip");
    expect(chip).toMatchObject({ kind: "chip", token: "[photo:1]", chipKind: "photo" });
    expect(segmentsToBody(segs.map(toSegment))).toBe(body);
  });

  it("round-trips a well-formed :::poll as a single chip token", () => {
    const body = "intro\n:::poll Pick one\n- a\n- b\n:::\nend";
    const segs = renderSegments(body, photos, []);
    const chip = segs.find((s) => s.kind === "chip");
    expect(chip).toMatchObject({ chipKind: "poll", label: "Pick one" });
    expect(chip && chip.kind === "chip" && chip.token.startsWith(":::poll")).toBe(true);
    expect(segmentsToBody(segs.map(toSegment))).toBe(body);
  });
});

describe("renderSegments mapping", () => {
  it("keeps an incomplete :::poll as plain text (one text segment, no chip)", () => {
    const body = ":::poll P\n- a\n:::"; // one option => incomplete
    const segs = renderSegments(body, photos, []);
    expect(segs.every((s) => s.kind === "text")).toBe(true);
  });

  it("labels a photo chip with its caption and carries the raw url as thumb", () => {
    const p = { ...photo("p3"), caption: "Reine at dawn" };
    const segs = renderSegments("[photo:p3]", [p], []);
    expect(segs.find((s) => s.kind === "chip")).toMatchObject({
      kind: "chip",
      chipKind: "photo",
      label: "Reine at dawn",
      thumb: "https://x/p3.jpg",
    });
  });

  it("flags a dangling ref as a broken chip but still round-trips", () => {
    const body = "x [ask:nope] y";
    const segs = renderSegments(body, photos, interactions);
    expect(segs.find((s) => s.kind === "chip")).toMatchObject({
      chipKind: "broken",
      label: "nope",
    });
    expect(segmentsToBody(segs.map(toSegment))).toBe(body);
  });
});
