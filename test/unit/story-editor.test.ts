import { describe, it, expect } from "vitest";
import {
  editorBlocks,
  insertAt,
  deleteToken,
  swapObjects,
  objectNeighbor,
  replaceRange,
  blockKey,
  type EditorInteraction,
} from "@/lib/story-editor";
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
  { id: "i1", kind: "poll", question: "Q?", options: ["a", "b"], correct_index: null },
];

describe("editorBlocks", () => {
  it("tiles the whole body (segments rejoin to the original)", () => {
    const body = "Intro\n[photo:p1]\nMiddle\n[ask:i1]\nEnd";
    const blocks = editorBlocks(body, photos, interactions);
    expect(blocks.map((b) => body.slice(b.start, b.end)).join("")).toBe(body);
  });

  it("interleaves prose, photo and interaction with prose always between", () => {
    const blocks = editorBlocks("Intro\n[photo:p1]\nEnd", photos, interactions);
    expect(blocks.map((b) => b.kind)).toEqual(["prose", "photo", "prose"]);
  });

  it("renders a well-formed :::poll as a pending card", () => {
    const blocks = editorBlocks(":::poll P\n- a\n- b\n:::", photos, []);
    expect(blocks.some((b) => b.kind === "pending")).toBe(true);
  });

  it("keeps an INCOMPLETE :::poll as prose text (not a card)", () => {
    const body = ":::poll P\n- a\n:::"; // only one option => problem
    const blocks = editorBlocks(body, photos, []);
    expect(blocks.every((b) => b.kind === "prose")).toBe(true);
  });

  it("flags a dangling photo ref as broken", () => {
    const blocks = editorBlocks("x [photo:zzz] y", photos, []);
    const broken = blocks.find((b) => b.kind === "broken");
    expect(broken).toMatchObject({ kind: "broken", refType: "photo", ref: "zzz" });
  });
});

describe("insertAt", () => {
  it("wraps a block insert in newlines and returns the caret after it", () => {
    const { body, caret } = insertAt("abc", 3, "[photo:p1]", { block: true });
    expect(body).toBe("abc\n[photo:p1]");
    expect(caret).toBe(body.length);
  });

  it("does not add a leading newline at the start of the doc", () => {
    const { body } = insertAt("abc", 0, "[photo:p1]", { block: true });
    expect(body).toBe("[photo:p1]\nabc");
  });
});

describe("deleteToken", () => {
  it("removes the span and collapses the blank lines left behind", () => {
    const body = "a\n\n[photo:p1]\n\nb";
    const start = body.indexOf("[photo:p1]");
    const end = start + "[photo:p1]".length;
    expect(deleteToken(body, start, end)).toBe("a\n\nb");
  });
});

describe("objectNeighbor / swapObjects", () => {
  const body = "[photo:p1]\nMiddle\n[ask:i1]";
  const blocks = editorBlocks(body, photos, interactions);
  const photoIdx = blocks.findIndex((b) => b.kind === "photo");
  const askIdx = blocks.findIndex((b) => b.kind === "interaction");

  it("finds the next object across the prose gap", () => {
    expect(objectNeighbor(blocks, photoIdx, "down")).toBe(askIdx);
    expect(objectNeighbor(blocks, photoIdx, "up")).toBe(-1);
  });

  it("swaps two objects, leaving the prose in place", () => {
    const out = swapObjects(body, blocks, photoIdx, "down")!;
    expect(out).toBe("[ask:i1]\nMiddle\n[photo:p1]");
  });

  it("returns null when there is no object neighbour", () => {
    expect(swapObjects(body, blocks, photoIdx, "up")).toBeNull();
  });
});

describe("replaceRange", () => {
  it("splices new text over a span", () => {
    expect(replaceRange("abcdef", 2, 4, "XY")).toBe("abXYef");
  });
});

describe("blockKey", () => {
  it("keys a prose block by the preceding object id so it is stable", () => {
    const body = "[photo:p1]\nMiddle";
    const blocks = editorBlocks(body, photos, []);
    const proseAfter = blocks.findIndex(
      (b, i) => b.kind === "prose" && i > 0,
    );
    expect(blockKey(blocks, proseAfter)).toBe("prose-after:photo:p1");
  });

  it("keys the head prose block stably", () => {
    const blocks = editorBlocks("hello", photos, []);
    expect(blockKey(blocks, 0)).toBe("prose-head");
  });
});
