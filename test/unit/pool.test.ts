import { describe, it, expect } from "vitest";
import { mapPool } from "@/lib/backup/pool";

// The export packs entries in the order this returns them, so "results in input
// order" is not a nicety — an archive whose contents depend on which download
// finished first is one nobody can diff against another.

describe("mapPool", () => {
  it("returns results in input order, not completion order", async () => {
    // Deliberately inverted: the last item finishes first.
    const out = await mapPool([30, 20, 10], 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return `${i}:${ms}`;
    });
    expect(out).toEqual(["0:30", "1:20", "2:10"]);
  });

  it("never runs more than `limit` at once", async () => {
    let running = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBeLessThanOrEqual(4);
    // And it really did run several at a time, or the assertion above is
    // satisfied by doing everything sequentially.
    expect(peak).toBeGreaterThan(1);
  });

  it("visits every item exactly once", async () => {
    const seen: number[] = [];
    await mapPool(Array.from({ length: 50 }, (_, i) => i), 7, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    );
  });

  it("handles an empty list without spawning anything", async () => {
    expect(await mapPool([], 8, async () => 1)).toEqual([]);
  });

  it("does not spawn more workers than there are items", async () => {
    let started = 0;
    await mapPool([1, 2], 16, async (n) => {
      started++;
      return n;
    });
    expect(started).toBe(2);
  });

  it("treats a nonsense limit as one at a time rather than none at all", async () => {
    // A zero or negative width would otherwise hang forever, which is the worst
    // possible failure for a backup: it looks like it is still working.
    expect(await mapPool([1, 2, 3], 0, async (n) => n * 2)).toEqual([2, 4, 6]);
    expect(await mapPool([1, 2, 3], -5, async (n) => n * 2)).toEqual([2, 4, 6]);
  });

  it("propagates a rejection instead of resolving with a hole in the results", async () => {
    await expect(
      mapPool([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("storage went away");
        return n;
      }),
    ).rejects.toThrow("storage went away");
  });
});
