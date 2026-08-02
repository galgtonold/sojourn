// Whether a photo is shown turned on its side.
//
// A landscape photo on a portrait phone otherwise fits into about 14% of the
// screen; turned 90° it fills roughly 69%, and its long edge grows by half. For
// a site that is mostly landscape photography that difference is worth having,
// and there is no way to ask for it properly: Safari implemented
// ScreenOrientation.type/.angle/.onchange but never lock(), so a web page cannot
// make an iPhone rotate. Turning the photo ourselves is the only lever.
//
// What rotates is the PHOTO AND ITS CAPTION, and nothing else. The paging drag
// and the arrows stay in screen space, so a swipe is always horizontal on the
// glass no matter which way the picture is facing. That is what keeps a set that
// mixes orientations coherent: a portrait photo simply doesn't turn, and nothing
// about how you navigate changes with it. Rotating the gesture along with the
// photo was the alternative, and it makes the swipe direction depend on which
// photo you happen to be looking at.
//
// The cost, stated plainly: tilt the phone to look at a turned photo and paging
// runs "up and down" relative to your head. It is constant, so it is learnable —
// and it only lasts while the device itself won't rotate. With auto-rotate on,
// tilting re-lays the page out to landscape, this returns false, and the photo
// fills the screen for real with everything upright.

/** Below this width/height ratio, turning the photo doesn't win back enough
 *  screen to be worth asking the reader to tilt their phone. */
export const ROTATE_ABOVE_RATIO = 1.15;

export function shouldRotatePhoto({
  portrait,
  ratio,
}: {
  /** Is the viewport taller than it is wide? */
  portrait: boolean;
  /** Natural width/height, or 0 while the photo is still unmeasured. */
  ratio: number;
}): boolean {
  return portrait && ratio > ROTATE_ABOVE_RATIO;
}
