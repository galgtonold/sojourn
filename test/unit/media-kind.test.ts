import { describe, expect, it } from "vitest";
import { mediaKind } from "@/lib/media-kind";

describe("mediaKind", () => {
  it("classifies images", () => {
    expect(mediaKind("image/jpeg")).toBe("image");
    expect(mediaKind("image/png")).toBe("image");
    expect(mediaKind("image/webp")).toBe("image");
  });
  it("accepts only web-playable video", () => {
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("video/webm")).toBe("video");
  });
  it("rejects non-web video and non-media", () => {
    expect(mediaKind("video/quicktime")).toBeNull();
    expect(mediaKind("video/x-msvideo")).toBeNull();
    expect(mediaKind("application/pdf")).toBeNull();
    expect(mediaKind("")).toBeNull();
  });
});
