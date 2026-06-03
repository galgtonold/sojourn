import type { Photo } from "@/lib/types";

// Inline photo tag: [photo:<id-or-1-based-index>]
const PHOTO_RE = /\[photo:([^\]\s]+)\]/g;

export type Block =
  | { kind: "md"; text: string }
  | { kind: "photo"; photo: Photo };

export function resolvePhoto(ref: string, photos: Photo[]): Photo | null {
  const byId = photos.find((p) => p.id === ref);
  if (byId) return byId;
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= photos.length) return photos[n - 1];
  return null;
}

// Splits a body into Markdown segments and inline-photo blocks, so prose and
// images can be rendered interleaved. Unresolved tags are left in the text.
export function parseBody(body: string, photos: Photo[]): Block[] {
  const blocks: Block[] = [];
  let last = 0;
  const re = new RegExp(PHOTO_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const photo = resolvePhoto(m[1], photos);
    if (!photo) continue; // leave the tag in the markdown text
    const before = body.slice(last, m.index);
    if (before.trim()) blocks.push({ kind: "md", text: before });
    blocks.push({ kind: "photo", photo });
    last = m.index + m[0].length;
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
  const re = new RegExp(PHOTO_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const p = resolvePhoto(m[1], photos);
    if (p) ids.add(p.id);
  }
  return ids;
}
