// Finds [photo:<ref>] tags in a body that reference a photo the model was not
// given. Isomorphic + pure so it runs both in the draft panel (to feed the
// invented ids back to the model and to warn the author) and anywhere else.
//
// A bare integer ref (e.g. [photo:2]) is a 1-based index that resolves against
// the post's gallery elsewhere, so we don't treat those as invented here.
const PHOTO_TAG_RE = /\[photo:([^\]\s]+)\]/g;

export function invalidPhotoRefs(body: string, allowedIds: string[]): string[] {
  const allowed = new Set(allowedIds);
  const bad = new Set<string>();
  const re = new RegExp(PHOTO_TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const ref = m[1];
    if (allowed.has(ref) || /^\d+$/.test(ref)) continue;
    bad.add(ref);
  }
  return [...bad];
}
