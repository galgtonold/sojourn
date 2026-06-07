import { describe, it, expect } from "vitest";
import { parseBody, referencedPhotoIds } from "@/lib/rich";
import type { Interaction, Photo } from "@/lib/types";

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

const poll: Interaction = {
  id: "i1",
  kind: "poll",
  question: "Q?",
  options: ["a", "b"],
  sort_order: 0,
};

describe("parseBody", () => {
  const photos = [photo("p1"), photo("p2")];

  it("interleaves markdown, photos and interactions in order", () => {
    const blocks = parseBody(
      "Intro\n[photo:p1]\nMiddle\n[ask:1]\nEnd",
      photos,
      [poll],
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      "md",
      "photo",
      "md",
      "interaction",
      "md",
    ]);
  });

  it("hides broken refs and pending blocks from the public view", () => {
    const blocks = parseBody(
      "x [photo:zzz] y\n:::poll P\n- a\n- b\n:::",
      photos,
      [],
    );
    expect(blocks.every((b) => b.kind === "md")).toBe(true);
  });

  it("surfaces broken refs and pending blocks when showIssues is set", () => {
    const blocks = parseBody(
      "x [photo:zzz] y\n\n:::poll P\n- a\n- b\n:::",
      photos,
      [],
      { showIssues: true },
    );
    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toContain("broken");
    expect(kinds).toContain("pending");
    const broken = blocks.find((b) => b.kind === "broken");
    expect(broken).toMatchObject({ refType: "photo", ref: "zzz" });
  });

  it("referencedPhotoIds collects inline photo ids only", () => {
    const ids = referencedPhotoIds("[photo:p2] [ask:1] [photo:nope]", photos);
    expect([...ids]).toEqual(["p2"]);
  });
});
