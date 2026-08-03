// Pure helpers for the pre-publish proofreader. No DOM, no I/O — unit-tested.

export type ProofType =
  | "spelling"
  | "grammar"
  | "punctuation"
  | "capitalization"
  | "wordchoice";

export type ProofField = "title" | "excerpt" | "body";

export type Finding = {
  id: string;
  field: ProofField;
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
const FIELDS: ProofField[] = ["title", "excerpt", "body"];

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
export function validateFindings(
  raw: unknown,
  fields: { title: string; excerpt: string; body: string },
): Finding[] {
  const list = (raw as { findings?: unknown } | null)?.findings;
  const arr = Array.isArray(list) ? list : [];
  const out: Finding[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    if (!FIELDS.includes(f.field as ProofField)) continue;
    if (!TYPES.includes(f.type as ProofType)) continue;
    const original = typeof f.original === "string" ? f.original : "";
    const suggestion = typeof f.suggestion === "string" ? f.suggestion : "";
    const explanation = typeof f.explanation === "string" ? f.explanation : "";
    if (!original || !suggestion || original === suggestion) continue;
    if (original.includes("[[KEEP-")) continue;
    const hay = fields[f.field as ProofField] ?? "";
    const at = hay.indexOf(original);
    if (at === -1) continue;
    const { before, after } = buildContext(hay, at, original.length);
    out.push({
      id: `f${out.length}`,
      field: f.field as ProofField,
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
