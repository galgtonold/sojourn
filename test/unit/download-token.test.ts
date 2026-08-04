import { describe, it, expect } from "vitest";
import { safeToken, downloadCookie, DOWNLOAD_COOKIE } from "@/lib/backup/download-token";

// The token comes from a query string and goes into a response header. That is
// the whole reason this is a module with tests rather than two lines inline.
describe("safeToken", () => {
  it("accepts what the page actually sends", () => {
    expect(safeToken("9f2c1a7e-4b3d-4c1a-9e8f-2b7c1a3d5e6f")).toBe(
      "9f2c1a7e-4b3d-4c1a-9e8f-2b7c1a3d5e6f",
    );
    expect(safeToken("abc123")).toBe("abc123");
  });

  it("refuses anything that could end the header early", () => {
    // Echoing a caller-supplied string into Set-Cookie is header injection with
    // extra steps — a newline here writes a header of the attacker's choosing.
    for (const bad of [
      "abc\r\nSet-Cookie: session=stolen",
      "abc\ndone",
      "abc; Domain=evil.test",
      "abc def",
      '"abc"',
      "abc,def",
    ]) {
      expect(safeToken(bad), bad).toBeNull();
    }
  });

  it("refuses nothing, and refuses too much", () => {
    expect(safeToken(null)).toBeNull();
    expect(safeToken("")).toBeNull();
    expect(safeToken("x".repeat(65))).toBeNull();
    expect(safeToken("x".repeat(64))).toBe("x".repeat(64));
  });
});

describe("downloadCookie", () => {
  it("expires quickly, because it is a signal and not state", () => {
    // A cookie left lying about would make the NEXT download look like it
    // finished the instant it started.
    const cookie = downloadCookie("abc123");
    expect(cookie).toContain(`${DOWNLOAD_COOKIE}=abc123`);
    expect(cookie).toMatch(/Max-Age=\d+/);
    expect(Number(/Max-Age=(\d+)/.exec(cookie)![1])).toBeLessThanOrEqual(60);
  });

  it("stays readable by the page that set it", () => {
    // Deliberately not HttpOnly: document.cookie is how the page learns the
    // download began, which is the entire point.
    expect(downloadCookie("abc")).not.toMatch(/HttpOnly/i);
    expect(downloadCookie("abc")).toContain("Path=/");
  });
});
