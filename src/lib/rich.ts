import type { Interaction, Photo } from "@/lib/types";
import {
  parseDirectives,
  type ParsedDirective,
} from "@/lib/interactions-parse";

// Inline tags: [photo:<id-or-index>] and [ask:<id-or-index>]
const TAG_RE = /\[(photo|ask):([^\]\s]+)\]/g;

export type Block =
  | { kind: "md"; text: string }
  | { kind: "photo"; photo: Photo }
  | { kind: "interaction"; interaction: Interaction }
  // Surfaced only when showIssues is on (editor preview), never to the public:
  | { kind: "pending"; spec: ParsedDirective }
  | { kind: "broken"; refType: "photo" | "ask"; ref: string };

export function resolvePhoto(ref: string, photos: Photo[]): Photo | null {
  const byId = photos.find((p) => p.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= photos.length) return photos[n - 1];
  return null;
}

function resolveInteraction(
  ref: string,
  interactions: Interaction[],
): Interaction | null {
  const byId = interactions.find((it) => it.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= interactions.length)
    return interactions[n - 1];
  return null;
}

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
  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, type, ref] = m;
    const resolved =
      type === "photo"
        ? resolvePhoto(ref, photos)
        : resolveInteraction(ref, interactions);
    let block: Block | null = null;
    if (resolved) {
      block =
        type === "photo"
          ? { kind: "photo", photo: resolved as Photo }
          : { kind: "interaction", interaction: resolved as Interaction };
    } else if (showIssues) {
      block = { kind: "broken", refType: type as "photo" | "ask", ref };
    }
    markers.push({ start: m.index, end: m.index + m[0].length, block });
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

// The set of photo ids placed inline, so the trailing gallery can skip them.
export function referencedPhotoIds(
  body: string,
  photos: Photo[],
): Set<string> {
  const ids = new Set<string>();
  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m[1] !== "photo") continue;
    const p = resolvePhoto(m[2], photos);
    if (p) ids.add(p.id);
  }
  return ids;
}
