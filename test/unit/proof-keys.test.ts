import { describe, it, expect } from "vitest";
import { parseProofKey, captionPhotoId } from "@/lib/ai/proofread";

// A key is the only thing connecting a finding to the row it must be written
// to. Parse it wrong and a fix lands on the wrong photo, the wrong quiz answer,
// or nowhere — and "nowhere" is silent, which is how the caption bug hid.

const PHOTO = "9f3c1d2e-0000-4000-8000-000000000001";
const BLOCK = "1a2b3c4d-0000-4000-8000-000000000002";

describe("parsing a proof key", () => {
  it("recognises the three post fields", () => {
    expect(parseProofKey("title")).toEqual({ kind: "post", field: "title" });
    expect(parseProofKey("excerpt")).toEqual({ kind: "post", field: "excerpt" });
    expect(parseProofKey("body")).toEqual({ kind: "post", field: "body" });
  });

  it("recognises the photo texts", () => {
    expect(parseProofKey(`caption:${PHOTO}`)).toEqual({
      kind: "caption",
      photoId: PHOTO,
    });
    expect(parseProofKey(`alt:${PHOTO}`)).toEqual({ kind: "alt", photoId: PHOTO });
  });

  it("recognises the poll and quiz texts, including which answer", () => {
    expect(parseProofKey(`question:${BLOCK}`)).toEqual({
      kind: "question",
      interactionId: BLOCK,
    });
    expect(parseProofKey(`explanation:${BLOCK}`)).toEqual({
      kind: "explanation",
      interactionId: BLOCK,
    });
    expect(parseProofKey(`option:${BLOCK}:2`)).toEqual({
      kind: "option",
      interactionId: BLOCK,
      index: 2,
    });
  });

  it("keeps answer 0 rather than treating it as missing", () => {
    // The classic falsy-index bug: the first answer is index 0.
    expect(parseProofKey(`option:${BLOCK}:0`)).toEqual({
      kind: "option",
      interactionId: BLOCK,
      index: 0,
    });
  });

  it("refuses anything it does not recognise instead of guessing", () => {
    for (const bad of [
      "",
      "nonsense",
      "caption:", // no id
      `option:${BLOCK}`, // no index
      `option:${BLOCK}:x`, // index not a number
      `option:${BLOCK}:-1`, // negative
      `trip:${BLOCK}`, // a kind we do not send
    ]) {
      expect(parseProofKey(bad), bad).toBeNull();
    }
  });

  it("still answers the narrow caption question", () => {
    expect(captionPhotoId(`caption:${PHOTO}`)).toBe(PHOTO);
    expect(captionPhotoId(`alt:${PHOTO}`)).toBeNull();
    expect(captionPhotoId("body")).toBeNull();
  });
});
