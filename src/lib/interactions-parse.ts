// Shared (client + server) parser for the inline poll/quiz authoring syntax and
// for validating a post body's references. The syntax lets a human — or the AI —
// declare a poll/quiz that doesn't exist yet, right inside the Markdown:
//
//   :::poll Which pass would you tackle first?
//   - Gemmi Pass
//   - Furka Pass
//   :::
//
//   :::quiz How high is the summit?
//   - 3000 m
//   - = 4158 m        («=» marks the correct option, quiz only)
//   - 5000 m
//   > Optional explanation, shown after answering.
//   :::
//
// On save these blocks are materialised into the `interactions` table and
// rewritten to [ask:<id>] tags (see lib/ai/materialize.ts).

export type InteractionKind = "poll" | "quiz";

export type InteractionSpec = {
  kind: InteractionKind;
  question: string;
  options: string[];
  correctIndex: number | null;
  explanation: string | null;
};

// A directive found in the body, with its source span and any problems.
export type ParsedDirective = InteractionSpec & {
  start: number;
  end: number;
  raw: string;
  problems: SpecProblem[];
};

// Problem codes are i18n keys (see lib/i18n.ts → "admin.litter.*").
export type SpecProblem = "question" | "options" | "correct";

// Matches a whole :::poll / :::quiz … ::: block (line-anchored fences).
const BLOCK_RE = /^:::(poll|quiz)[ \t]*([^\n]*)\n([\s\S]*?)^:::[ \t]*$/gm;

function parseInner(
  kind: InteractionKind,
  question: string,
  inner: string,
): InteractionSpec {
  const options: string[] = [];
  let correctIndex: number | null = null;
  const explanationLines: string[] = [];

  for (const rawLine of inner.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(">")) {
      explanationLines.push(line.slice(1).trim());
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      let text = bullet[1].trim();
      // A leading «=» (optionally "[x]") marks the correct answer.
      const correct = /^(=|\[x\])\s*/i.test(text);
      if (correct) {
        text = text.replace(/^(=|\[x\])\s*/i, "").trim();
        if (correctIndex === null) correctIndex = options.length;
      }
      if (text) options.push(text);
    }
  }

  return {
    kind,
    question: question.trim(),
    options,
    correctIndex: kind === "quiz" ? correctIndex : null,
    explanation:
      kind === "quiz" && explanationLines.length
        ? explanationLines.join(" ")
        : null,
  };
}

export function specProblems(spec: InteractionSpec): SpecProblem[] {
  const problems: SpecProblem[] = [];
  if (!spec.question) problems.push("question");
  if (spec.options.length < 2) problems.push("options");
  if (spec.kind === "quiz" && spec.correctIndex === null)
    problems.push("correct");
  return problems;
}

// Finds every :::poll / :::quiz block in document order.
export function parseDirectives(body: string): ParsedDirective[] {
  const out: ParsedDirective[] = [];
  const re = new RegExp(BLOCK_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const kind = m[1] as InteractionKind;
    const spec = parseInner(kind, m[2] ?? "", m[3] ?? "");
    out.push({
      ...spec,
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      problems: specProblems(spec),
    });
  }
  return out;
}

// Inline reference tags: [photo:<id-or-index>] and [ask:<id-or-index>].
const TAG_RE = /\[(photo|ask):([^\]\s]+)\]/g;

export type BodyIssue =
  | { type: "unknown-photo"; ref: string }
  | { type: "unknown-ask"; ref: string }
  | { type: "bad-interaction"; kind: InteractionKind; problems: SpecProblem[] };

export type BodyContext = {
  photoIds: string[];
  photoCount: number;
  interactionIds: string[];
  interactionCount: number;
};

function resolves(ref: string, ids: string[], count: number): boolean {
  if (ids.includes(ref)) return true;
  const n = Number(ref);
  return Number.isInteger(n) && n >= 1 && n <= count;
}

// Collects everything wrong with a body: dangling photo/poll references and
// malformed inline poll/quiz blocks. Well-formed :::blocks are *not* issues —
// they materialise on save.
export function validateBody(body: string, ctx: BodyContext): BodyIssue[] {
  const issues: BodyIssue[] = [];
  const re = new RegExp(TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const [, type, ref] = m;
    if (type === "photo" && !resolves(ref, ctx.photoIds, ctx.photoCount))
      issues.push({ type: "unknown-photo", ref });
    if (type === "ask" && !resolves(ref, ctx.interactionIds, ctx.interactionCount))
      issues.push({ type: "unknown-ask", ref });
  }
  for (const d of parseDirectives(body)) {
    if (d.problems.length)
      issues.push({ type: "bad-interaction", kind: d.kind, problems: d.problems });
  }
  return issues;
}
