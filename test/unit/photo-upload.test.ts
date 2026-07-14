import { describe, it, expect } from "vitest";
import {
  validateUploadFile,
  uploadResultToRow,
  MAX_VIDEO_BYTES,
} from "@/lib/photo-upload";
import type { UploadResult } from "@/lib/upload-client";

describe("validateUploadFile", () => {
  it("accepts an image of any size", () => {
    expect(validateUploadFile({ type: "image/jpeg", size: 999_999_999 })).toEqual({
      ok: true,
      kind: "image",
    });
  });

  it("accepts a web-playable video within the size cap", () => {
    expect(validateUploadFile({ type: "video/mp4", size: MAX_VIDEO_BYTES })).toEqual({
      ok: true,
      kind: "video",
    });
  });

  it("rejects a video over the size cap", () => {
    expect(validateUploadFile({ type: "video/webm", size: MAX_VIDEO_BYTES + 1 })).toEqual({
      ok: false,
    });
  });

  it("rejects an unsupported media type (e.g. HEVC .mov)", () => {
    expect(validateUploadFile({ type: "video/quicktime", size: 10 })).toEqual({
      ok: false,
    });
  });

  it("rejects a non-media file", () => {
    expect(validateUploadFile({ type: "application/pdf", size: 10 })).toEqual({
      ok: false,
    });
  });
});

describe("uploadResultToRow", () => {
  const res: UploadResult = {
    url: "https://cdn/x.webp",
    path: "uploads/x.webp",
    lat: 48.1,
    lng: 11.6,
    takenAt: "2026-07-06T14:03:11Z",
    takenOffsetMin: 120,
    width: 2880,
    height: 1620,
    blurhash: "L6PZ",
    mediaType: "image",
    posterUrl: null,
    posterPath: null,
  };

  it("maps an UploadResult to a photos insert row at the given order", () => {
    expect(uploadResultToRow(res, "post-1", 7)).toEqual({
      post_id: "post-1",
      url: "https://cdn/x.webp",
      storage_path: "uploads/x.webp",
      media_type: "image",
      poster_url: null,
      poster_path: null,
      lat: 48.1,
      lng: 11.6,
      taken_at: "2026-07-06T14:03:11Z",
      taken_at_offset_min: 120,
      width: 2880,
      height: 1620,
      blurhash: "L6PZ",
      sort_order: 7,
    });
  });

  it("carries a video's poster fields through", () => {
    const video: UploadResult = {
      ...res,
      mediaType: "video",
      posterUrl: "https://cdn/x-poster.webp",
      posterPath: "uploads/x-poster.webp",
    };
    const row = uploadResultToRow(video, "post-1", 0);
    expect(row.media_type).toBe("video");
    expect(row.poster_url).toBe("https://cdn/x-poster.webp");
    expect(row.poster_path).toBe("uploads/x-poster.webp");
  });
});
