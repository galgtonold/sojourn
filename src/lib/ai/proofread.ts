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

// ─── Segmenting a body for proofreading ─────────────────────────────────────
//
// The proofreader used to send the whole post in one call. That worked for two
// months and then stopped, on every attempt, in a way the usage log made plain:
//
//   2026-07-06 … 2026-08-01   9 calls, 9 ok, completions 2845–5575
//   2026-08-03                8 calls, 0 ok, finish_reason "length" every time
//
// The largest prompt that ever succeeded was 1741 tokens; the smallest that
// failed was 1800. A 3% larger input does not triple the work, so this is not
// the article — it is the model reasoning without bound past some threshold.
// `reasoning_content` is billed against `max_tokens`, so the budget was spent
// thinking and the answer never started. The retry loop then DOUBLED the cap
// and burned ~16000 more before giving up, which is why it hung so long before
// failing.
//
// Raising the cap is not the fix: 16000 already failed, and a bigger cap buys a
// longer hang. Instead keep every call inside the size that demonstrably works —
// a 748-token prompt still succeeded on 2026-08-01, mid-outage.

/** Roughly 1400 characters ≈ 400–500 tokens of German prose. */
export const SEGMENT_CHARS = 1400;

/**
 * Split a body into segments small enough to proofread reliably.
 *
 * Every segment is a VERBATIM slice of the input, and concatenating them in
 * order reproduces it exactly. That is what lets findings from one segment be
 * validated against the whole body afterwards: `original` is looked up in the
 * full text, so the model never needs to know it was handed a fragment.
 *
 * Splits on blank lines first, so a segment is whole paragraphs wherever
 * possible. A single paragraph longer than the budget is split again at
 * sentence ends; anything still too long is emitted as-is rather than cut
 * mid-word, because a fragment that ends mid-sentence produces bogus findings.
 */
export function segmentBody(body: string, maxChars = SEGMENT_CHARS): string[] {
  if (!body.trim()) return [];
  if (body.length <= maxChars) return [body];

  // Keep the separators so the pieces still concatenate to the original.
  const paras = body.split(/(\n\s*\n)/);
  const units: string[] = [];
  for (let i = 0; i < paras.length; i += 2) {
    const unit = paras[i] + (paras[i + 1] ?? "");
    if (unit) units.push(unit);
  }

  const pieces: string[] = [];
  for (const unit of units) {
    if (unit.length <= maxChars) {
      pieces.push(unit);
      continue;
    }
    // Over-long paragraph: split after sentence-ending punctuation.
    const sentences = unit.split(/(?<=[.!?…])(\s+)/);
    let cur = "";
    for (let i = 0; i < sentences.length; i += 2) {
      const s = sentences[i] + (sentences[i + 1] ?? "");
      if (cur && cur.length + s.length > maxChars) {
        pieces.push(cur);
        cur = "";
      }
      cur += s;
    }
    if (cur) pieces.push(cur);
  }

  // Pack consecutive pieces up to the budget.
  const out: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (cur && cur.length + p.length > maxChars) {
      out.push(cur);
      cur = "";
    }
    cur += p;
  }
  if (cur) out.push(cur);
  return out;
}

/** Merge the `findings` arrays of several model responses into one payload. */
export function mergeFindingPayloads(payloads: unknown[]): { findings: unknown[] } {
  const findings: unknown[] = [];
  for (const p of payloads) {
    const list = (p as { findings?: unknown } | null)?.findings;
    if (Array.isArray(list)) findings.push(...list);
  }
  return { findings };
}
