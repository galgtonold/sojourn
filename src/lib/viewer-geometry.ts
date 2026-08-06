// Geometry the full-screen photo viewer needs before it has an image.
//
// Both functions exist because the viewer used to wait for a load event to
// learn things it already knew, and the waiting was visible.

/**
 * A photo's display ratio (width/height) from its stored dimensions, or 0 when
 * they are unknown.
 *
 * The upload path measures with `createImageBitmap(file, { imageOrientation:
 * "from-image" })`, so the stored numbers are the DISPLAY dimensions — already
 * turned the way EXIF asks — and they match what the browser reports once the
 * image loads. Verified against production: a 2268x4032 original is served
 * downscaled to 1620x2880, a different size but the identical ratio, which is
 * the only part rotation and the slide's shape depend on.
 *
 * 0 means "ask the image once it loads", which is what the viewer did for
 * everything until now, and still does for the handful of photos that predate
 * the dimension columns.
 */
export function intrinsicRatio(item: {
  width?: number | null;
  height?: number | null;
}): number {
  const w = item.width ?? 0;
  const h = item.height ?? 0;
  // A zero or negative height would divide to Infinity or NaN and, through
  // shouldRotatePhoto, turn every photo on its side forever.
  if (!(w > 0) || !(h > 0)) return 0;
  return w / h;
}

/**
 * The React key for a mounted cell — identifying the PHOTO, not the slot.
 *
 * Three cells are mounted at a time and the index commits only once the slide
 * has finished, so at that moment the cell that was "next" becomes "current".
 * Keyed by its offset, React reuses that DOM node for a different photo: the
 * <img> keeps its identity and only its `src` changes, and a browser goes on
 * painting the image it already has until the new one decodes. The result is a
 * flash back to the picture you just left, on the photo and — more visibly —
 * on the blurred wash, which had already handed over during the slide.
 *
 * Keyed by the photo's index the node simply moves: the cell showing the
 * incoming photo survives the commit with its pixels intact, and the only new
 * mount is the neighbour coming into range, which is meant to be loading.
 *
 * With exactly two photos the same picture is both the previous and the next
 * cell, so index keys would collide. Those fall back to slot keys — and two
 * photos is precisely the case where both are already decoded, so the swap has
 * nothing to flash.
 */
export function cellKey(index: number, off: number, count: number): string {
  return count > 2 ? `photo-${index}` : `slot-${off}`;
}

/**
 * The caps the slide is fitted inside, kept next to the Tailwind classes that
 * declare them in photo-slide.tsx. The two must agree: these compute the box,
 * those are the safety net for photos whose ratio is unknown.
 */
const FIT = {
  upright: { width: "96vw", height: "96dvh" },
  // Turned, the photo is measured against the viewport with its axes swapped.
  rotated: { width: "92dvh", height: "95vw" },
} as const;

/**
 * The exact box a photo of this ratio will occupy — computed, not waited for.
 *
 * The slide shrink-wraps its photo so the caption can sit ON the photo's bottom
 * edge at any aspect ratio. The cost was that an <img> has no size until it
 * loads, so the box was 0x0 and the caption painted in the middle of the screen
 * before jumping onto the photo, and the blurhash had no rect to fill.
 *
 * Width and height attributes look like the fix and are not: the browser treats
 * them as presentational hints that make the width DEFINITE, which defeats the
 * ratio-preserving constrain algorithm. Measured on a 2560x1384 screen, a
 * 2268x4032 portrait then occupied a 2268x1329 box instead of 747x1329 — stable,
 * but three times too wide, with the caption stranded off the side of the photo.
 *
 * So state the contain fit directly. `min(widthCap, heightCap * ratio)` is what
 * the browser would have computed from the intrinsic size, and `aspect-ratio`
 * supplies the other axis — giving the identical box from the first frame:
 * 747x1329 before load and after it, verified against the same screen.
 *
 * Undefined when the ratio is unknown (a few photos predate the dimension
 * columns), which leaves those measuring on load exactly as before.
 */
export function slideBox(
  ratio: number,
  rotated: boolean,
): { width: string; aspectRatio: string } | undefined {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return undefined;
  const cap = rotated ? FIT.rotated : FIT.upright;
  return {
    width: `min(${cap.width}, calc(${cap.height} * ${ratio}))`,
    aspectRatio: String(ratio),
  };
}

/**
 * Opacity keyframes that make a per-slide layer track the drag.
 *
 * The blurred wash behind the photo used to be a single element, mounted
 * outside the track the photos ride on and sourced from the committed index.
 * The index commits only after the 260ms slide animation resolves, so the
 * photo finished arriving and only then did the wash swap underneath it — the
 * reader watched the background change its mind a beat late.
 *
 * Giving every mounted slide its own wash and fading them against the same
 * motion value the track already uses makes the two one movement. Cell `off`
 * sits at `left: off * 100%`, so it is centred when the track is at
 * `x = -off * width`: that is where its wash is fully lit, and it is dark by
 * the time either neighbour reaches centre. Adjacent pairs therefore always
 * sum to 1 — the background never dims mid-swipe.
 *
 * The seam is the commit itself. At the end of a forward page the track is at
 * `x = -width` and the incoming photo is cell `+1` (opacity 1); the index then
 * lands, the cells re-map around it so it becomes cell `0`, and `x` resets to
 * 0 in the same paint — where cell `0` is also opacity 1. Nothing blinks
 * because both sides of the swap describe the same picture.
 */
export function slideFade(
  off: number,
  width: number,
): { input: number[]; output: number[] } {
  // useTransform needs strictly ascending stops, and `view.width` is 0 for the
  // first frame of a server-rendered mount. Collapsing to 0 there would give
  // three identical stops and silently break the mapping, leaving the viewer
  // with no backdrop at all.
  const w = width > 0 ? width : 1;
  return {
    input: [-(off + 1) * w, -off * w, -(off - 1) * w],
    output: [0, 1, 0],
  };
}
