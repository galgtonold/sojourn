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
};

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
    if (!hay.includes(original)) continue;
    out.push({
      id: `f${out.length}`,
      field: f.field as ProofField,
      type: f.type as ProofType,
      original,
      suggestion,
      explanation,
    });
  }
  return out;
}
