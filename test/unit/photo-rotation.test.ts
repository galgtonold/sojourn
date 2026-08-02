import { describe, it, expect } from "vitest";
import { shouldRotatePhoto } from "@/lib/photo-rotation";

describe("shouldRotatePhoto", () => {
  it("turns a landscape photo on a portrait screen", () => {
    expect(shouldRotatePhoto({ portrait: true, ratio: 1.5 })).toBe(true);
  });

  it("leaves a portrait or square photo alone", () => {
    expect(shouldRotatePhoto({ portrait: true, ratio: 0.67 })).toBe(false);
    expect(shouldRotatePhoto({ portrait: true, ratio: 1 })).toBe(false);
  });

  it("never turns anything on a landscape screen", () => {
    expect(shouldRotatePhoto({ portrait: false, ratio: 1.5 })).toBe(false);
    // The device rotating is the real fix; this must get out of its way.
    expect(shouldRotatePhoto({ portrait: false, ratio: 3 })).toBe(false);
  });

  it("ignores a barely-landscape photo — not worth tilting the phone for", () => {
    expect(shouldRotatePhoto({ portrait: true, ratio: 1.15 })).toBe(false);
    expect(shouldRotatePhoto({ portrait: true, ratio: 1.16 })).toBe(true);
  });

  it("stays upright until the photo has been measured", () => {
    expect(shouldRotatePhoto({ portrait: true, ratio: 0 })).toBe(false);
  });

  it("decides per photo, so a mixed set turns only the landscape ones", () => {
    const set = [1.5, 0.67, 1.78].map((ratio) =>
      shouldRotatePhoto({ portrait: true, ratio }),
    );
    expect(set).toEqual([true, false, true]);
  });
});
