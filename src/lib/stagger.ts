// How a list's reveal animation is staggered.
//
// A cascade is worth it for the cards already on screen when the page loads —
// they all appear at once otherwise. Below the fold it is actively harmful:
// each card already arrives at its own moment as you scroll, so a delay keyed
// to list position just makes you wait, and it grows with the list. At 33 trips
// the last card sat blank for 1.6s after you reached it; at 100 it would be 5s.
//
// So: cascade the first screenful, then get out of the way.

/** Seconds between consecutive cards in the opening cascade. */
export const STAGGER_STEP = 0.05;

/** Cards after this many reveal with no delay at all. */
export const STAGGER_LIMIT = 6;

export function staggerDelay(index: number): number {
  if (!Number.isFinite(index) || index <= 0) return 0;
  return index < STAGGER_LIMIT ? index * STAGGER_STEP : 0;
}
