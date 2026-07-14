import type { Interaction, Photo } from "@/lib/types";
import {
  parseDirectives,
  type ParsedDirective,
} from "@/lib/interactions-parse";
import { matchRefTags, resolveRef, referencedPhotoIds } from "@/lib/references";

// The reference-tag grammar and resolution rule now live in @/lib/references.
// Re-exported here so existing importers of resolvePhoto/referencedPhotoIds keep
// working; resolvePhoto is just resolveRef specialized to photos.
export { referencedPhotoIds };
export const resolvePhoto = (ref: string, photos: Photo[]): Photo | null =>
  resolveRef(ref, photos);

export type Block =
  | { kind: "md"; text: string }
  | { kind: "photo"; photo: Photo }
  | { kind: "interaction"; interaction: Interaction }
  // Surfaced only when showIssues is on (editor preview), never to the public:
  | { kind: "pending"; spec: ParsedDirective }
  | { kind: "broken"; refType: "photo" | "ask"; ref: string };

type Marker = { start: number; end: number; block: Block | null };

// Splits a body into Markdown, inline photos, polls/quizzes, and — when
// showIssues is set — visible placeholders for not-yet-created polls (:::blocks)
// and dangling references. In the public view those placeholders are dropped.
export function parseBody(
  body: string,
  photos: Photo[],
  interactions: Interaction[] = [],
  opts: { showIssues?: boolean } = {},
): Block[] {
  const showIssues = opts.showIssues ?? false;
  const markers: Marker[] = [];

  // Inline tag references.
  for (const t of matchRefTags(body)) {
    const resolved =
      t.type === "photo"
        ? resolveRef(t.ref, photos)
        : resolveRef(t.ref, interactions);
    let block: Block | null = null;
    if (resolved) {
      block =
        t.type === "photo"
          ? { kind: "photo", photo: resolved as Photo }
          : { kind: "interaction", interaction: resolved as Interaction };
    } else if (showIssues) {
      block = { kind: "broken", refType: t.type, ref: t.ref };
    }
    markers.push({ start: t.start, end: t.end, block });
  }

  // Inline :::poll / :::quiz authoring blocks (litter that materialises on save).
  for (const d of parseDirectives(body)) {
    markers.push({
      start: d.start,
      end: d.end,
      block: showIssues ? { kind: "pending", spec: d } : null,
    });
  }

  markers.sort((a, b) => a.start - b.start);

  const blocks: Block[] = [];
  let last = 0;
  for (const mk of markers) {
    if (mk.start < last) continue; // skip overlaps defensively
    const before = body.slice(last, mk.start);
    if (before.trim()) blocks.push({ kind: "md", text: before });
    if (mk.block) blocks.push(mk.block);
    last = mk.end;
  }
  const rest = body.slice(last);
  if (rest.trim()) blocks.push({ kind: "md", text: rest });
  return blocks;
}
