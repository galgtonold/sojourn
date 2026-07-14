// The one owner of the inline reference-tag grammar and its resolution rule.
// A reference tag is `[photo:REF]` or `[ask:REF]`, where REF is either an id
// (a uuid) or a 1-based index into the post's ordered photos / interactions —
// and never contains whitespace. Before this module the grammar was copy-pasted
// across a dozen files with two subtly different character classes, and the
// "a bare integer means the Nth item" rule was reimplemented four times; adding
// a tag type or changing the index semantics meant editing all of them.
import type { Photo } from "@/lib/types";

export type RefType = "photo" | "ask";
export type RefTag = { type: RefType; ref: string; start: number; end: number };

// Canonical grammar. `[^\]\s]+` on purpose: an id/index has no whitespace, so a
// stray-space "tag" is not a reference (it stays as prose).
const TAG_MATCH = /\[(photo|ask):([^\]\s]+)\]/g; // capturing (type, ref)
const TAG_STRIP = /\[(?:photo|ask):[^\]\s]+\]/g; // non-capturing, for .replace

/** Every reference tag in `body`, in document order, with its character span. */
export function matchRefTags(body: string): RefTag[] {
  const re = new RegExp(TAG_MATCH); // fresh lastIndex
  const out: RefTag[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push({
      type: m[1] as RefType,
      ref: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/** Remove every reference tag (for text handed to the model / search, where the
 *  tags are noise). Does NOT touch :::poll/:::quiz blocks — that's a directive. */
export function stripRefTags(body: string, replacement = ""): string {
  return body.replace(new RegExp(TAG_STRIP), replacement);
}

/** A bare 1-based index reference (e.g. `[photo:2]`), as opposed to an id. */
export function isIndexRef(ref: string): boolean {
  return /^\d+$/.test(ref);
}

/**
 * Resolve a ref against an ordered, id-keyed list: an exact id first, else a
 * 1-based index. THE index rule — every caller that resolves a tag shares this
 * so `[photo:2]`/`[ask:2]` mean the same thing everywhere. Null when neither hits.
 */
export function resolveRef<T extends { id: string }>(
  ref: string,
  items: T[],
): T | null {
  const byId = items.find((x) => x.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= items.length) return items[n - 1];
  return null;
}

/** Whether a ref resolves (by id or valid 1-based index) — for validators that
 *  hold only the ids + a count, not the objects. Same rule as resolveRef. */
export function refResolves(ref: string, ids: string[], count: number): boolean {
  if (ids.includes(ref)) return true;
  const n = Number(ref);
  return Number.isInteger(n) && n >= 1 && n <= count;
}

/** The set of photo ids placed inline in `body` (so the trailing gallery can
 *  skip them). Resolves id-or-index against `photos`. */
export function referencedPhotoIds(body: string, photos: Photo[]): Set<string> {
  const ids = new Set<string>();
  for (const t of matchRefTags(body)) {
    if (t.type !== "photo") continue;
    const p = resolveRef(t.ref, photos);
    if (p) ids.add(p.id);
  }
  return ids;
}
