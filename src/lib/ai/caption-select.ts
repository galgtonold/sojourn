// Which of a post's photos to (re)caption. Pure, so the rules are tested without
// a database or a model call.

export type CaptionSource = {
  id: string;
  ai_description?: string | null;
  place_name?: string | null;
  caption?: string | null;
};

// Eligible photos: those with something to describe (a vision description or a
// place name), optionally only the ones still uncaptioned, capped so the prompt
// stays fast.
export function selectCaptionTargets<T extends CaptionSource>(
  photos: T[],
  opts: { onlyEmpty: boolean; limit?: number; ids?: string[] },
): T[] {
  const idSet = opts.ids ? new Set(opts.ids) : null;
  return photos
    .filter((p) => p.ai_description || p.place_name)
    .filter((p) => (opts.onlyEmpty ? !p.caption : true))
    .filter((p) => (idSet ? idSet.has(p.id) : true))
    .slice(0, opts.limit ?? 40);
}
