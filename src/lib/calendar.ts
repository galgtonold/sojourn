// Calendar maths for the editor's date field.
//
// Everything here is local-calendar arithmetic and builds its ISO strings by
// hand. `new Date(...).toISOString()` is the trap: it converts to UTC first, so
// a local midnight west of Greenwich comes back as the *previous* day — which
// shows up as a picker that stores the day before the one you clicked, and only
// for some of your users.

export type DayCell = {
  /** YYYY-MM-DD, the value the field stores. */
  iso: string;
  /** Day of month, as printed in the cell. */
  day: number;
  /** False for the leading/trailing days borrowed from the neighbouring month. */
  inMonth: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD for a local (year, 0-based month, day). */
export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** Today, in the viewer's own calendar. */
export function isoToday(): string {
  const now = new Date();
  return toIso(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Step a (year, month) pair by whole months, rolling the year over. */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/**
 * Six weeks of cells covering `month`, Monday first, padded from the
 * neighbouring months.
 *
 * Always 42 cells: a month that needs only five rows would otherwise make the
 * popover change height as you page through the year, which reads as a glitch
 * and moves whatever sits below it.
 */
export function monthGrid(year: number, month: number): DayCell[] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday-based; the week here starts on Monday.
  const lead = (first.getDay() + 6) % 7;

  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    // Date normalises out-of-range days for us, so day 0 and day 32 resolve
    // into the neighbouring months without any special casing.
    const d = new Date(year, month, 1 - lead + i);
    cells.push({
      iso: toIso(d.getFullYear(), d.getMonth(), d.getDate()),
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }
  return cells;
}
