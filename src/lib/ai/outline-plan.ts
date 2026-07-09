// Pure outline post-processing: guarantee every photo lands in a section so a
// stray never spawns a junk section (and none is silently dropped). A leftover
// joins the section of its nearest neighbour in the given order — looking
// earlier first, then later — falling back to the first section.

export function assignLeftoverPhotos<S extends { photo_ids: string[] }>(
  sections: S[],
  orderedIds: string[],
): S[] {
  if (sections.length === 0) return sections;
  // Work on copies so the input is never mutated.
  const next = sections.map((s) => ({ ...s, photo_ids: [...s.photo_ids] }));
  const sectionOf = new Map<string, number>();
  next.forEach((s, i) => s.photo_ids.forEach((id) => sectionOf.set(id, i)));

  for (let k = 0; k < orderedIds.length; k++) {
    const id = orderedIds[k];
    if (sectionOf.has(id)) continue;
    let target = -1;
    for (let j = k - 1; j >= 0; j--) {
      const t = sectionOf.get(orderedIds[j]);
      if (t != null) { target = t; break; }
    }
    if (target === -1) {
      for (let j = k + 1; j < orderedIds.length; j++) {
        const t = sectionOf.get(orderedIds[j]);
        if (t != null) { target = t; break; }
      }
    }
    if (target === -1) target = 0;
    next[target].photo_ids.push(id);
    sectionOf.set(id, target);
  }
  return next;
}
