// Pure helpers for the pre-publish proofreader. No DOM, no I/O — unit-tested.

export type ProofType =
  | "spelling"
  | "grammar"
  | "punctuation"
  | "capitalization"
  | "wordchoice";

/**
 * One addressable piece of text the proofreader checks.
 *
 * The key is opaque and travels through the model and back untouched. Post
 * fields keep their own names; anything with an identity carries it after a
 * colon, e.g. `caption:9f3c…`. That is what lets a finding say WHICH caption it
 * belongs to — the old closed `"title" | "excerpt" | "body"` union had nowhere
 * to put that, which is the only reason captions went unchecked while being the
 * likeliest place for a typo: they are written by hand, quickly, and skip the
 * drafting pipeline entirely.
 *
 * `ordinal` is for display ("Caption 3"), not identity.
 */
export type ProofUnit = { key: string; text: string; ordinal?: number };

/** Post fields keep their bare names, so old findings still resolve. */
export const POST_KEYS = ["title", "excerpt", "body"] as const;
export type ProofField = (typeof POST_KEYS)[number];

export const CAPTION_PREFIX = "caption:";

/**
 * What a key points at. Everything reader-facing on a post is addressable:
 *
 *   title | excerpt | body        the article itself
 *   caption:<photoId>             what sits under a photo
 *   alt:<photoId>                 what a screen reader says instead
 *   question:<interactionId>      a poll or quiz prompt
 *   option:<interactionId>:<i>    one answer of one
 *   explanation:<interactionId>   the note shown after answering
 *
 * All of it is published prose. Only the article was ever checked.
 */
export type ProofTarget =
  | { kind: "post"; field: ProofField }
  | { kind: "caption"; photoId: string }
  | { kind: "alt"; photoId: string }
  | { kind: "question"; interactionId: string }
  | { kind: "explanation"; interactionId: string }
  | { kind: "option"; interactionId: string; index: number };

/** Null for anything unrecognised — an unknown key is never guessed at. */
export function parseProofKey(key: string): ProofTarget | null {
  if ((POST_KEYS as readonly string[]).includes(key)) {
    return { kind: "post", field: key as ProofField };
  }
  const [prefix, id, tail] = key.split(":");
  if (!id) return null;
  switch (prefix) {
    case "caption":
      return { kind: "caption", photoId: id };
    case "alt":
      return { kind: "alt", photoId: id };
    case "question":
      return { kind: "question", interactionId: id };
    case "explanation":
      return { kind: "explanation", interactionId: id };
    case "option": {
      const index = Number(tail);
      return Number.isInteger(index) && index >= 0
        ? { kind: "option", interactionId: id, index }
        : null;
    }
    default:
      return null;
  }
}

/** The photo id inside a caption key, or null for anything else. */
export function captionPhotoId(key: string): string | null {
  const t = parseProofKey(key);
  return t?.kind === "caption" ? t.photoId : null;
}

export type Finding = {
  id: string;
  /** Which unit this belongs to — see ProofUnit. */
  key: string;
  /** 1-based position among units of the same kind, for labelling only. */
  ordinal?: number;
  type: ProofType;
  original: string;
  suggestion: string;
  explanation: string;
  // The text immediately around `original` in its field, so the author can see
  // where the fix lands in context. Media/interaction placeholders are elided
  // and whitespace collapsed; a leading/trailing "…" marks a truncated edge.
  before: string;
  after: string;
};

const KEEP_RE = /\[\[KEEP-\d+\]\]/g;

// Build the display context around a match: up to ~42 chars either side, snapped
// to whole words, with media/interaction placeholders removed and runs of
// whitespace (incl. newlines) collapsed to single spaces.
export function buildContext(
  hay: string,
  index: number,
  len: number,
): { before: string; after: string } {
  const W = 42;
  const startTrunc = index > W;
  const endTrunc = index + len + W < hay.length;
  const clean = (s: string) => s.replace(KEEP_RE, " ").replace(/\s+/g, " ");
  let before = clean(hay.slice(Math.max(0, index - W), index));
  let after = clean(hay.slice(index + len, index + len + W));
  // Drop a partial word at a truncated edge so context reads cleanly.
  if (startTrunc) before = before.replace(/^\S*\s/, "");
  if (endTrunc) after = after.replace(/\s\S*$/, "");
  before = before.trimStart();
  after = after.trimEnd();
  return {
    before: (startTrunc ? "… " : "") + before,
    after: after + (endTrunc ? " …" : ""),
  };
}

const TYPES: ProofType[] = [
  "spelling",
  "grammar",
  "punctuation",
  "capitalization",
  "wordchoice",
];

// Replace the FIRST literal occurrence of `original` with `suggestion`. Returns
// the new text, or null when `original` is absent (the author edited it away).
// Uses indexOf/slice so the needle is matched literally (no regex semantics).
export function applyFinding(
  text: string,
  original: string,
  suggestion: string,
): string | null {
  const i = text.indexOf(original);
  if (i === -1) return null;
  return text.slice(0, i) + suggestion + text.slice(i + original.length);
}

// Keep only well-formed findings whose `original` is a verbatim substring of the
// submitted field (title/excerpt as-is; body already masked to [[KEEP-n]]),
// contains no KEEP sentinel, and actually changes the text. Assigns stable ids.
export function validateFindings(raw: unknown, units: ProofUnit[]): Finding[] {
  const byKey = new Map(units.map((u) => [u.key, u]));
  const list = (raw as { findings?: unknown } | null)?.findings;
  const arr = Array.isArray(list) ? list : [];
  const out: Finding[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const key = typeof f.key === "string" ? f.key : "";
    const unit = byKey.get(key);
    // A key we never sent is a hallucination, and so is a suggestion whose
    // `original` is not actually in that unit's text. Both are dropped rather
    // than shown: an author cannot act on a fix that does not fit anywhere.
    if (!unit) continue;
    if (!TYPES.includes(f.type as ProofType)) continue;
    const original = typeof f.original === "string" ? f.original : "";
    const suggestion = typeof f.suggestion === "string" ? f.suggestion : "";
    const explanation = typeof f.explanation === "string" ? f.explanation : "";
    if (!original || !suggestion || original === suggestion) continue;
    if (original.includes("[[KEEP-")) continue;
    const at = unit.text.indexOf(original);
    if (at === -1) continue;
    const { before, after } = buildContext(unit.text, at, original.length);
    out.push({
      id: `f${out.length}`,
      key: unit.key,
      ordinal: unit.ordinal,
      type: f.type as ProofType,
      original,
      suggestion,
      explanation,
      before,
      after,
    });
  }
  return out;
}
