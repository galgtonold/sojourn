import { describe, it, expect } from "vitest";
import { monthGrid, addMonths, toIso, isoToday } from "@/lib/calendar";

// The editor's date field is a calendar the site draws itself, so the grid
// maths is ours to get right. Everything here works in LOCAL calendar terms and
// never touches toISOString(), which would shift the day for anyone east or
// west of UTC — the bug that makes a picker select the day before the one you
// clicked.

describe("monthGrid", () => {
  it("returns whole weeks, and only the weeks the month reaches into", () => {
    // A trailing row of nothing but next month's greyed-out days reads as a
    // rendering fault, so the grid stops at the week the month ends in.
    for (const [y, m] of [[2024, 0], [2024, 1], [2026, 6], [2027, 11]] as const) {
      const cells = monthGrid(y, m);
      expect(cells.length % 7).toBe(0);
      expect(cells.length).toBeLessThanOrEqual(42);
      // The last row always contains at least one day of this month.
      expect(cells.slice(-7).some((c) => c.inMonth)).toBe(true);
    }
  });

  it("uses five rows when five are enough", () => {
    // February 2025: starts Saturday, 28 days → ends in the fifth row.
    expect(monthGrid(2025, 1)).toHaveLength(35);
    // February 2021: starts Monday, 28 days → exactly four rows.
    expect(monthGrid(2021, 1)).toHaveLength(28);
  });

  it("uses six when the month needs them", () => {
    // August 2026 starts on a Saturday and runs 31 days.
    expect(monthGrid(2026, 7)).toHaveLength(42);
  });

  it("starts the week on Monday and pads with the previous month", () => {
    // 1 January 2024 was a Monday, so no padding is needed at all.
    const jan = monthGrid(2024, 0);
    expect(jan[0]).toEqual({ iso: "2024-01-01", day: 1, inMonth: true });

    // 1 June 2024 was a Saturday: Monday–Friday come from May.
    const jun = monthGrid(2024, 5);
    expect(jun[0]).toEqual({ iso: "2024-05-27", day: 27, inMonth: false });
    expect(jun[5]).toEqual({ iso: "2024-06-01", day: 1, inMonth: true });
  });

  it("keeps every day of the month, leap years included", () => {
    const feb = monthGrid(2024, 1).filter((c) => c.inMonth);
    expect(feb).toHaveLength(29);
    expect(feb[28].iso).toBe("2024-02-29");

    expect(monthGrid(2025, 1).filter((c) => c.inMonth)).toHaveLength(28);
  });

  it("pads the tail with the next month, but only to finish the week", () => {
    // January 2024 ran Mon 1 – Wed 31, so the last row is padded to Sunday 4 Feb.
    const cells = monthGrid(2024, 0);
    expect(cells).toHaveLength(35);
    expect(cells[cells.length - 1]).toEqual({
      iso: "2024-02-04",
      day: 4,
      inMonth: false,
    });
  });

  it("numbers days as the calendar does, not as an offset", () => {
    // Guards the classic slip of writing the array index into `day`.
    for (const cell of monthGrid(2026, 6)) {
      expect(cell.day).toBe(Number(cell.iso.slice(8)));
    }
  });
});

describe("addMonths", () => {
  it("rolls over the year in both directions", () => {
    expect(addMonths(2024, 11, 1)).toEqual({ year: 2025, month: 0 });
    expect(addMonths(2024, 0, -1)).toEqual({ year: 2023, month: 11 });
  });

  it("handles more than a year at a time", () => {
    expect(addMonths(2024, 5, 14)).toEqual({ year: 2025, month: 7 });
    expect(addMonths(2024, 5, -18)).toEqual({ year: 2022, month: 11 });
  });
});

describe("toIso", () => {
  it("zero-pads, so string comparison matches date order", () => {
    expect(toIso(2024, 0, 5)).toBe("2024-01-05");
    expect(toIso(2024, 11, 31)).toBe("2024-12-31");
  });

  it("reads back the local day, not a UTC-shifted one", () => {
    // toISOString() on a local midnight Date returns the previous day west of
    // UTC. Building the string by hand is the whole point of this helper.
    const iso = toIso(2024, 0, 1);
    expect(iso).toBe("2024-01-01");
  });
});

describe("isoToday", () => {
  it("is a well-formed date string", () => {
    expect(isoToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
