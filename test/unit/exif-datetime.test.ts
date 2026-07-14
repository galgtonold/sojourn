import { describe, it, expect } from "vitest";
import { parseExifDateTime } from "@/lib/exif-datetime";

describe("parseExifDateTime", () => {
  it("labels the wall-clock as UTC and keeps a negative offset in minutes", () => {
    expect(parseExifDateTime("2026:07:06 14:03:11", "-05:00")).toEqual({
      takenAt: "2026-07-06T14:03:11Z",
      takenOffsetMin: -300,
    });
  });

  it("handles a positive offset", () => {
    expect(parseExifDateTime("2026:07:06 14:03:11", "+02:00").takenOffsetMin).toBe(120);
  });

  it("accepts a 'T' separator and trims surrounding whitespace in the offset", () => {
    expect(parseExifDateTime("2026:07:06T14:03:11", "  +02:00  ")).toEqual({
      takenAt: "2026-07-06T14:03:11Z",
      takenOffsetMin: 120,
    });
  });

  it("returns a null offset when none is present", () => {
    expect(parseExifDateTime("2026:07:06 14:03:11")).toEqual({
      takenAt: "2026-07-06T14:03:11Z",
      takenOffsetMin: null,
    });
  });

  it("returns nulls for a missing / malformed date or offset", () => {
    expect(parseExifDateTime(undefined)).toEqual({ takenAt: null, takenOffsetMin: null });
    expect(parseExifDateTime("not a date")).toEqual({ takenAt: null, takenOffsetMin: null });
    expect(parseExifDateTime(1234)).toEqual({ takenAt: null, takenOffsetMin: null });
    expect(parseExifDateTime("2026:07:06 14:03:11", "garbage").takenOffsetMin).toBeNull();
  });
});
