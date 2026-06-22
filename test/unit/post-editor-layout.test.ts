import { describe, it, expect } from "vitest";
import { defaultOpenSections, coverFromPhotos } from "@/lib/post-editor-layout";

describe("defaultOpenSections", () => {
  it("opens capture + AI for a fresh draft", () => {
    const o = defaultOpenSections(false);
    expect(o).toMatchObject({ trip: true, photos: true, ai: true, article: false, details: false });
  });
  it("opens the article for an existing post", () => {
    const o = defaultOpenSections(true);
    expect(o.article).toBe(true);
    expect(o.trip).toBe(false);
    expect(o.photos).toBe(false);
  });
});

describe("coverFromPhotos", () => {
  const photos = [
    { id: "p1", url: "https://x/p1.jpg" },
    { id: "p2", url: "https://x/p2.jpg" },
  ];
  it("matches the cover url to a photo id", () => {
    expect(coverFromPhotos("https://x/p2.jpg", photos)).toBe("p2");
  });
  it("returns null when the cover is a non-photo url or empty", () => {
    expect(coverFromPhotos("https://other/x.jpg", photos)).toBeNull();
    expect(coverFromPhotos("", photos)).toBeNull();
  });
});
