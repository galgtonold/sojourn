// Pure helpers for the staged post-editor layout (no React/DOM).
export type SectionId =
  | "trip"
  | "photos"
  | "track"
  | "polls"
  | "ai"
  | "article"
  | "details";

// Which sections start expanded: a fresh draft lands on capture + generate; an
// existing post (already has prose) lands on the article. Everything else stays
// collapsed to a one-line header.
export function defaultOpenSections(hasBody: boolean): Record<SectionId, boolean> {
  return {
    trip: !hasBody,
    photos: !hasBody,
    track: false,
    polls: false,
    ai: !hasBody,
    article: hasBody,
    details: false,
  };
}

// The id of the photo currently used as the cover (so the picker can mark it),
// or null when the cover is empty or a pasted non-photo URL.
export function coverFromPhotos(
  coverUrl: string,
  photos: { id: string; url: string | null }[],
): string | null {
  if (!coverUrl) return null;
  return photos.find((p) => p.url === coverUrl)?.id ?? null;
}
