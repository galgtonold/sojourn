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

export type OutlineSection = {
  heading: string;
  beat: string;
  photo_ids: string[];
  interaction?: { kind: "poll" | "quiz"; idea: string } | null;
  // Ids of the author's pre-defined interactions placed in this section.
  interaction_refs?: string[];
};

export type Outline = {
  title: string;
  excerpt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_photo_id: string | null;
  date?: string | null;
  sections: OutlineSection[];
};

// The ground-truth the reducer reconciles the model's plan against.
export type OutlineInputs = {
  photoIds: string[];
  interactionIds: string[];
  geo: { lat: number | null; lng: number | null; place: string | null } | null;
  date: string | null;
};

// At most this many *invented* interactions across the plan (one per section;
// the model spreads them when the author asked for several).
const MAX_INVENTED = 6;

/**
 * Pure: reconcile the model's raw outline against the post's real inputs.
 * Enforces the invariants the section writer downstream relies on:
 * - photo_ids keep only real ids;
 * - each author-defined interaction is assigned to EXACTLY ONE section
 *   (deduped as encountered; any the model dropped are distributed round-robin);
 * - at most MAX_INVENTED model-invented interactions survive, each well-formed;
 * - every photo lands in a section (assignLeftoverPhotos), never a junk one;
 * - location/coords/date come from real data (dossier) when present, not the
 *   model's guess.
 */
export function reconcileOutline(raw: Outline, inputs: OutlineInputs): Outline {
  const validPhotos = new Set(inputs.photoIds);
  const predefined = new Set(inputs.interactionIds);
  const assigned = new Set<string>();
  let invented = 0;

  let sections: OutlineSection[] = (raw.sections ?? []).map((s) => {
    const refs = (Array.isArray(s.interaction_refs) ? s.interaction_refs : [])
      .filter((id) => predefined.has(id) && !assigned.has(id));
    refs.forEach((id) => assigned.add(id));
    const ix =
      s.interaction &&
      (s.interaction.kind === "poll" || s.interaction.kind === "quiz") &&
      s.interaction.idea?.trim() &&
      invented < MAX_INVENTED
        ? ((invented += 1), s.interaction)
        : null;
    return {
      ...s,
      photo_ids: (s.photo_ids ?? []).filter((id) => validPhotos.has(id)),
      interaction: ix,
      interaction_refs: refs,
    };
  });

  // Guarantee at least one section so the pipeline can proceed.
  if (sections.length === 0) {
    sections = [
      {
        heading: raw.title || "",
        beat: "",
        photo_ids: [...inputs.photoIds],
        interaction_refs: [],
      },
    ];
  }

  // Every photo must land somewhere; a stray joins its nearest section by order.
  sections = assignLeftoverPhotos(sections, inputs.photoIds);

  // Any author interaction the model didn't place gets a home round-robin, so
  // every one is guaranteed to be emitted by the section writer.
  const leftover = [...predefined].filter((id) => !assigned.has(id));
  leftover.forEach((id, i) => {
    const sec = sections[i % sections.length];
    sec.interaction_refs = [...(sec.interaction_refs ?? []), id];
  });

  const geo = inputs.geo;
  return {
    ...raw,
    location: geo && geo.place ? geo.place : raw.location,
    lat: geo && geo.lat != null ? geo.lat : raw.lat,
    lng: geo && geo.lng != null ? geo.lng : raw.lng,
    date: inputs.date,
    sections,
  };
}
