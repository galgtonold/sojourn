import { describe, it, expect } from "vitest";
import { formatBytes } from "@/lib/utils";

// Shown while a backup downloads, next to a percentage. Its whole job is being
// glanceable, so the cases that matter are the boundaries and the nonsense.
describe("formatBytes", () => {
  it("uses one unit with at most one decimal", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB");
  });

  it("crosses each boundary the way a file manager does", () => {
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("says something sensible for nothing at all", () => {
    // A download that has not started yet, and a Content-Length a proxy ate.
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(-1)).toBe("0 KB");
    expect(formatBytes(NaN)).toBe("0 KB");
  });
});
