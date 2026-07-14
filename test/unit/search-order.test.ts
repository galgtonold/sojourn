import { describe, it, expect } from "vitest";
import { orderByIds, isMissingFunction } from "@/lib/content";

describe("orderByIds", () => {
  it("reorders rows to match the id ranking", () => {
    const rows = [{ id: "b" }, { id: "a" }, { id: "c" }];
    expect(orderByIds(rows, ["a", "b", "c"]).map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("puts unranked ids last and does not mutate the input", () => {
    const rows = [{ id: "x" }, { id: "a" }];
    const out = orderByIds(rows, ["a"]);
    expect(out.map((r) => r.id)).toEqual(["a", "x"]);
    expect(rows.map((r) => r.id)).toEqual(["x", "a"]); // unmutated
  });
});

describe("isMissingFunction", () => {
  it("recognizes a missing hybrid-search function (fall back quietly)", () => {
    expect(isMissingFunction({ code: "42883" })).toBe(true);
    expect(isMissingFunction({ code: "PGRST202" })).toBe(true);
    expect(
      isMissingFunction({
        message: "Could not find the function search_posts_hybrid",
      }),
    ).toBe(true);
  });

  it("does not treat a real query error as a missing function", () => {
    expect(isMissingFunction({ code: "22P02", message: "invalid input" })).toBe(
      false,
    );
    expect(isMissingFunction(new Error("boom"))).toBe(false);
    expect(isMissingFunction(null)).toBe(false);
  });
});
