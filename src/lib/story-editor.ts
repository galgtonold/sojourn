// Pure block model + string mutations for the unified story editor. The post
// `body` markdown string stays the single source of truth; this module derives
// an ordered, fully-tiling block list from it and performs every edit as a
// string-offset operation. Mirrors the style of src/lib/rich.ts and reuses its
// resolution helpers, so editor and public renderer never diverge.
import type { Photo } from "@/lib/types";
import { resolvePhoto } from "@/lib/rich";
import {
  parseDirectives,
  type ParsedDirective,
} from "@/lib/interactions-parse";

// Admin-side interaction shape: the public Interaction plus the quiz answer key,
// which the editor page fetches (correct_index) so a quiz card can mark it.
export type EditorInteraction = {
  id: string;
  kind: "poll" | "quiz";
  question: string;
  options: string[];
  correct_index?: number | null;
};

export type EditorBlock =
  | { kind: "prose"; text: string; start: number; end: number }
  | { kind: "photo"; photo: Photo; start: number; end: number }
  | { kind: "interaction"; interaction: EditorInteraction; start: number; end: number }
  | { kind: "pending"; spec: ParsedDirective; start: number; end: number }
  | { kind: "broken"; refType: "photo" | "ask"; ref: string; start: number; end: number };

const TAG_RE = /\[(photo|ask):([^\]\s]+)\]/g;

function resolveInteraction(
  ref: string,
  interactions: EditorInteraction[],
): EditorInteraction | null {
  const byId = interactions.find((it) => it.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= interactions.length)
    return interactions[n - 1];
  return null;
}

type Marker = { start: number; end: number; block: EditorBlock };

/**
 * Derive the editor block list. Unlike rich.ts's parseBody, prose blocks are
 * ALWAYS emitted (even empty) between and around objects, so there is always an
 * editable slice with a caret home; and INCOMPLETE :::poll/:::quiz directives
 * are left inside the prose text (so a half-typed poll can still be finished) —
 * only well-formed ones become pending cards.
 */
export function editorBlocks(
  body: string,
  photos: Photo[],
  interactions: EditorInteraction[],
): EditorBlock[] {
  const markers: Marker[] = [];

  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, type, ref] = m;
    const start = m.index;
    const end = m.index + m[0].length;
    if (type === "photo") {
      const p = resolvePhoto(ref, photos);
      markers.push({
        start,
        end,
        block: p
          ? { kind: "photo", photo: p, start, end }
          : { kind: "broken", refType: "photo", ref, start, end },
      });
    } else {
      const it = resolveInteraction(ref, interactions);
      markers.push({
        start,
        end,
        block: it
          ? { kind: "interaction", interaction: it, start, end }
          : { kind: "broken", refType: "ask", ref, start, end },
      });
    }
  }

  for (const d of parseDirectives(body)) {
    if (d.problems.length === 0)
      markers.push({
        start: d.start,
        end: d.end,
        block: { kind: "pending", spec: d, start: d.start, end: d.end },
      });
  }

  markers.sort((a, b) => a.start - b.start);

  const blocks: EditorBlock[] = [];
  let last = 0;
  for (const mk of markers) {
    if (mk.start < last) continue; // defensive: skip overlaps
    blocks.push({ kind: "prose", text: body.slice(last, mk.start), start: last, end: mk.start });
    blocks.push(mk.block);
    last = mk.end;
  }
  blocks.push({ kind: "prose", text: body.slice(last), start: last, end: body.length });
  return blocks;
}

export function replaceRange(
  body: string,
  start: number,
  end: number,
  text: string,
): string {
  return body.slice(0, start) + text + body.slice(end);
}

/** Insert text at an offset. With `block`, ensure it sits on its own line. */
export function insertAt(
  body: string,
  offset: number,
  text: string,
  opts: { block?: boolean } = {},
): { body: string; caret: number } {
  let ins = text;
  if (opts.block) {
    const before = body.slice(0, offset);
    const after = body.slice(offset);
    ins =
      (before && !before.endsWith("\n") ? "\n" : "") +
      text +
      (after && !after.startsWith("\n") ? "\n" : "");
  }
  return {
    body: body.slice(0, offset) + ins + body.slice(offset),
    caret: offset + ins.length,
  };
}

/** Remove a token's span and collapse the blank lines it leaves behind. */
export function deleteToken(body: string, start: number, end: number): string {
  return (body.slice(0, start) + body.slice(end)).replace(/\n{3,}/g, "\n\n");
}

/** Index of the nearest object (non-prose) block in a direction, or -1. */
export function objectNeighbor(
  blocks: EditorBlock[],
  index: number,
  dir: "up" | "down",
): number {
  const step = dir === "up" ? -1 : 1;
  for (let j = index + step; j >= 0 && j < blocks.length; j += step) {
    if (blocks[j].kind !== "prose") return j;
  }
  return -1;
}

/**
 * Swap an object block with its nearest object neighbour, leaving all prose in
 * place (the two tokens trade slots). Returns null if there is no neighbour or
 * the target block is prose. Splices the later span first so the earlier offset
 * stays valid.
 */
export function swapObjects(
  body: string,
  blocks: EditorBlock[],
  index: number,
  dir: "up" | "down",
): string | null {
  if (blocks[index].kind === "prose") return null;
  const j = objectNeighbor(blocks, index, dir);
  if (j === -1) return null;
  const a = index < j ? blocks[index] : blocks[j];
  const b = index < j ? blocks[j] : blocks[index];
  const aText = body.slice(a.start, a.end);
  const bText = body.slice(b.start, b.end);
  let out = body.slice(0, b.start) + aText + body.slice(b.end);
  out = out.slice(0, a.start) + bText + out.slice(a.end);
  return out;
}

/**
 * Stable React key for a block, so untouched blocks don't remount on re-parse
 * (which would lose caret/scroll). Object blocks key by their stable token id;
 * a prose block keys by the id of the object immediately before it (or "head"),
 * with an index fallback for transient cases (pending/broken, consecutive prose).
 */
export function blockKey(blocks: EditorBlock[], index: number): string {
  const b = blocks[index];
  if (b.kind === "photo") return `photo:${b.photo.id}`;
  if (b.kind === "interaction") return `ask:${b.interaction.id}`;
  if (b.kind === "pending") return `pending:${index}`;
  if (b.kind === "broken") return `broken:${b.refType}:${b.ref}:${index}`;
  const prev = blocks[index - 1];
  if (prev?.kind === "photo") return `prose-after:photo:${prev.photo.id}`;
  if (prev?.kind === "interaction") return `prose-after:ask:${prev.interaction.id}`;
  return index === 0 ? "prose-head" : `prose:${index}`;
}
