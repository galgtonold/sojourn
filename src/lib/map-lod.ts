// Two levels of detail for the global /map, so opening a world view doesn't
// cost an archive's worth of GPS fixes.
//
// The alternative — one tier, simplified enough to be small — was rejected when
// the simplification work was done, and the reasoning still holds: this page
// opens on a world view but it ZOOMS, and a coarse line puts the route on the
// wrong side of the street once you get close. The guarantee is that whatever
// you can see is accurate to a metre. So the page ships the coarse tier, which
// is all a world view can resolve, and swaps in the metre-accurate one the
// moment the zoom could reveal the difference.
//
// Every number here is derived, not chosen by eye: the overview tolerance is
// kept well under one screen pixel at every zoom it is actually displayed at
// (see test/unit/map-lod.test.ts, which pins the arithmetic).

/** Web-mercator resolution at the equator: 256px tiles, 40,075,016.686 m around. */
export function metresPerPixel(zoom: number): number {
  return 156543.03392804097 / 2 ** zoom;
}

/**
 * Below this zoom the overview tier is drawn; at or above it, the detail tier.
 *
 * 11 puts the switch at ~76 m per pixel — long before any street is
 * distinguishable — so the finer geometry is always already in place by the
 * time it could possibly matter.
 */
export const DETAIL_FROM_ZOOM = 11;

/**
 * Simplification for the first payload. At 25 m the error is under a third of a
 * pixel at zoom 10, the last level it is shown at, and proportionally less at
 * every level below — literally not renderable, whatever the line width.
 */
export const OVERVIEW_TOLERANCE_M = 25;

/** The promise: what you see up close is within a metre of what was recorded. */
export const DETAIL_TOLERANCE_M = 1;

/** Whether the current zoom warrants the metre-accurate geometry. */
export function needsDetail(zoom: number): boolean {
  return zoom >= DETAIL_FROM_ZOOM;
}
