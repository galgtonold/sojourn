// Where a horizontal drag should settle. Pure so the thresholds — the part that
// decides whether a gesture felt like a page-turn or a wobble — are testable
// without a pointer.

/** Past this fraction of the viewport, the drag alone commits. */
const DISTANCE_RATIO = 0.25;
/** …and below it, this px/s still commits: a flick is short but fast. */
const FLICK_VELOCITY = 500;
/** A flick must also have travelled a little, so a fast tap (high velocity over
 *  almost no distance, which is what a jittery finger produces) stays a tap. */
const FLICK_MIN_DISTANCE = 12;
/** Fallback when the container hasn't been measured yet. */
const FALLBACK_DISTANCE = 60;

/**
 * @param dx       horizontal travel in px (negative = dragged left)
 * @param velocity px/s at release (negative = moving left)
 * @param width    the cell's width in px — one photo's worth of travel
 * @returns the index delta to commit: 1 = next, -1 = previous, 0 = spring back
 */
export function swipeTarget({
  dx,
  velocity,
  width,
}: {
  dx: number;
  velocity: number;
  width: number;
}): -1 | 0 | 1 {
  const distance = width > 0 ? width * DISTANCE_RATIO : FALLBACK_DISTANCE;
  const flicked = Math.abs(dx) >= FLICK_MIN_DISTANCE;
  // Dragging LEFT (negative dx) pulls the next photo in from the right.
  if (dx <= -distance || (flicked && velocity <= -FLICK_VELOCITY)) return 1;
  if (dx >= distance || (flicked && velocity >= FLICK_VELOCITY)) return -1;
  return 0;
}

/** Whether a pointer gesture moved far enough to be a drag rather than a click —
 *  used to swallow the click that trails a drag, so paging doesn't also dismiss
 *  the viewer. */
export function wasDragged(dx: number): boolean {
  return Math.abs(dx) > 6;
}
