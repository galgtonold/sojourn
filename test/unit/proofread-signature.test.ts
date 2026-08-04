import { describe, it, expect } from "vitest";
import {
  buildProofUnits,
  proofreadSignature,
  type ProofSource,
} from "@/lib/ai/proofread";

// The pre-publish nudge asks one question: has anything changed since the last
// proofread? It used to hash `title + excerpt + body` and nothing else, so
// fixing a typo in a caption — or writing a whole new one — published silently
// as "already proofread". These pin the answer for every kind of text.

const base: ProofSource = {
  title: "Ein Tag im Wald",
  excerpt: "Kurz raus.",
  body: "Wir liefen lange.",
  photos: [
    { id: "p1", caption: "Blick über die Dünen", alt: "Ein Wald im Nebel" },
    { id: "p2", caption: null, alt: null },
  ],
  interactions: [
    {
      id: "b1",
      question: "Welches Tier lebt hier?",
      options: ["Der Fuchs", "Das Reh"],
      explanation: "Der Fuchs ist scheu.",
    },
  ],
};

const sig = (s: ProofSource) => proofreadSignature(buildProofUnits(s));

describe("what the signature covers", () => {
  it("is stable for identical content", () => {
    expect(sig(base)).toBe(sig(structuredClone(base)));
  });

  it("changes when the body changes", () => {
    expect(sig({ ...base, body: "Wir liefen kurz." })).not.toBe(sig(base));
  });

  it("changes when a caption changes — the case that shipped broken", () => {
    const edited = structuredClone(base);
    edited.photos[0].caption = "Blick über die Duenen";
    expect(sig(edited)).not.toBe(sig(base));
  });

  it("changes when alt text changes", () => {
    const edited = structuredClone(base);
    edited.photos[0].alt = "Ein wald im nebel";
    expect(sig(edited)).not.toBe(sig(base));
  });

  it("changes when a quiz question, answer or explanation changes", () => {
    for (const mutate of [
      (s: ProofSource) => (s.interactions[0].question = "Welches Tier lebt hir?"),
      (s: ProofSource) => (s.interactions[0].options[1] = "Das Re"),
      (s: ProofSource) => (s.interactions[0].explanation = "Der Fuchs ist schau."),
    ]) {
      const edited = structuredClone(base);
      mutate(edited);
      expect(sig(edited)).not.toBe(sig(base));
    }
  });

  it("ignores gallery re-ordering, which is not an edit", () => {
    // Keys carry identity, so moving a photo must not read as changed text —
    // otherwise every drag would demand a fresh proofread.
    const reordered = structuredClone(base);
    reordered.photos.reverse();
    expect(sig(reordered)).toBe(sig(base));
  });

  it("ignores empty text, so adding a photo without a caption is not a change", () => {
    const withBlank = structuredClone(base);
    withBlank.photos.push({ id: "p3", caption: "", alt: "   " });
    expect(sig(withBlank)).toBe(sig(base));
  });

  it("notices a caption appearing on a photo that had none", () => {
    const captioned = structuredClone(base);
    captioned.photos[1].caption = "Neu beschriftet";
    expect(sig(captioned)).not.toBe(sig(base));
  });

  it("stays short regardless of how long the post is", () => {
    const huge = structuredClone(base);
    huge.body = "x".repeat(200_000);
    expect(sig(huge)).toHaveLength(8);
  });
});

describe("the units the signature is built from", () => {
  it("drops empty text but keeps everything written", () => {
    const units = buildProofUnits(base);
    const keys = units.map((u) => u.key).sort();
    expect(keys).toEqual(
      [
        "alt:p1",
        "body",
        "caption:p1",
        "excerpt",
        "explanation:b1",
        "option:b1:0",
        "option:b1:1",
        "question:b1",
        "title",
      ].sort(),
    );
  });

  it("numbers by gallery position, not by which photos have text", () => {
    // p2 has no caption; a later captioned photo must still report its real
    // position or "caption 3" sends the author to the wrong picture.
    const src = structuredClone(base);
    src.photos.push({ id: "p3", caption: "Dritte", alt: null });
    const unit = buildProofUnits(src).find((u) => u.key === "caption:p3");
    expect(unit?.ordinal).toBe(3);
  });
});
