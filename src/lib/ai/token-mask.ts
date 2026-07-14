// Pure, isomorphic helpers for the "homogenize" pass. A full-body rewrite must
// never corrupt a [photo:<uuid>] tag or mangle a :::poll/:::quiz block, so we
// swap each of those for an opaque numbered sentinel before handing the text to
// the model, then restore them verbatim afterward. If the rewrite drops or
// duplicates a sentinel we can detect it and fall back to the original body.
import { parseDirectives } from "@/lib/interactions-parse";

// [photo:<id>] and [ask:<id>] inline reference tags.
const TAG_RE = /\[(?:photo|ask):[^\]\s]+\]/g;

export type Masked = { masked: string; tokens: string[] };

// A sentinel the model is told to copy verbatim. Distinctive, ASCII, and the
// trailing "]]" keeps "[[KEEP-1]]" from matching inside "[[KEEP-10]]".
function sentinel(n: number): string {
  return `[[KEEP-${n}]]`;
}

/**
 * Replace every protected span — :::poll/:::quiz blocks and [photo:]/[ask:]
 * tags — with a numbered sentinel. Returns the masked text and the originals
 * indexed by sentinel number.
 */
export function maskProtectedTokens(body: string): Masked {
  type Span = { start: number; end: number; text: string };
  const spans: Span[] = [];
  for (const d of parseDirectives(body)) {
    spans.push({ start: d.start, end: d.end, text: d.raw });
  }
  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  spans.sort((a, b) => a.start - b.start);

  const tokens: string[] = [];
  let out = "";
  let cursor = 0;
  for (const s of spans) {
    if (s.start < cursor) continue; // overlaps a span already taken (e.g. a tag inside a block)
    out += body.slice(cursor, s.start) + sentinel(tokens.length);
    tokens.push(s.text);
    cursor = s.end;
  }
  out += body.slice(cursor);
  return { masked: out, tokens };
}

/** True iff every sentinel appears exactly once — i.e. the rewrite kept them all. */
export function allMasksPresent(masked: string, tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const first = masked.indexOf(sentinel(i));
    if (first === -1) return false;
    if (masked.indexOf(sentinel(i), first + 1) !== -1) return false;
  }
  return true;
}

/**
 * Defensive cleanup for a rewrite pass: if the model wrapped its whole answer
 * in a ```fence``` despite being told not to, unwrap it — otherwise the entire
 * article would render as one code block. Only strips a fence that encloses the
 * ENTIRE string, so a code sample inside the prose is left untouched.
 */
export function stripWrappingCodeFence(text: string): string {
  const t = text.trim();
  const m = t.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
  return m ? m[1].trim() : text;
}

/** Restore the original tokens. Only meaningful when allMasksPresent is true. */
export function restoreProtectedTokens(masked: string, tokens: string[]): string {
  let out = masked;
  for (let i = 0; i < tokens.length; i++) {
    // String find (not regex) + function replacement: literal match, and the
    // original text is inserted as-is even if it contains `$`.
    out = out.replace(sentinel(i), () => tokens[i]);
  }
  return out;
}

/**
 * The safe homogenize composition: mask the protected spans, hand the masked
 * text to `homogenize`, and accept the rewrite ONLY if every sentinel survived.
 * A dropped/duplicated sentinel, an empty result, or a thrown error all fall
 * back to the raw body, so a full-body rewrite can never corrupt a photo/quiz
 * token or lose one — the load-bearing safety property of this module. Returns
 * the final body and whether the polish was discarded (`fellBack`).
 *
 * The model call is injected so the composition is testable without a network.
 * `rethrowIf` lets the caller pass an abort straight through instead of treating
 * it as a fallback (the whole run should stop, not silently keep the raw concat).
 */
export async function homogenizeWithMasking(
  rawBody: string,
  homogenize: (masked: string) => Promise<string>,
  opts?: { rethrowIf?: (e: unknown) => boolean },
): Promise<{ body: string; fellBack: boolean }> {
  if (!rawBody) return { body: rawBody, fellBack: false };
  const { masked, tokens } = maskProtectedTokens(rawBody);
  let out: string;
  try {
    out = stripWrappingCodeFence(await homogenize(masked));
  } catch (e) {
    if (opts?.rethrowIf?.(e)) throw e;
    return { body: rawBody, fellBack: true };
  }
  if (out && allMasksPresent(out, tokens)) {
    return { body: restoreProtectedTokens(out, tokens), fellBack: false };
  }
  return { body: rawBody, fellBack: true };
}
