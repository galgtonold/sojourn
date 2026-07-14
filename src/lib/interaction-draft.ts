// Validate + normalize a poll/quiz builder draft into the row the DB stores.
// Extracted from InteractionManager (a client component, excluded from
// coverage) because the option-filtering + correct-index remap is exactly the
// kind of index bookkeeping that breaks silently.
//
// The subtle part: the builder's `correctIndex` points into the RAW options
// (the radio buttons bind to those), but blank options are filtered out before
// saving. The stored index must therefore be remapped to the chosen option's
// position AMONG THE SURVIVORS — otherwise a blank option sitting before the
// answer shifts every later index and the quiz silently marks the wrong choice
// correct. The old inline check (`correctIndex >= cleanOptions.length`) missed
// this, and also wrongly rejected a valid answer that happened to sit past a
// blank.

export type InteractionKind = "poll" | "quiz";

export type InteractionDraft = {
  kind: InteractionKind;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
};

// The persisted shape (DB column names), minus the caller-supplied post_id /
// sort_order.
export type InteractionPayload = {
  kind: InteractionKind;
  question: string;
  options: string[];
  correct_index: number | null;
  explanation: string | null;
};

// Which field failed — the component maps this to the matching i18n message.
export type DraftError = "question" | "options" | "correct";

export type DraftResult =
  | { ok: true; payload: InteractionPayload }
  | { ok: false; error: DraftError };

export function buildInteractionPayload(draft: InteractionDraft): DraftResult {
  const question = draft.question.trim();
  if (!question) return { ok: false, error: "question" };

  const options = draft.options.map((o) => o.trim()).filter(Boolean);
  if (options.length < 2) return { ok: false, error: "options" };

  let correct_index: number | null = null;
  let explanation: string | null = null;
  if (draft.kind === "quiz") {
    const remapped = remapCorrectIndex(draft.options, draft.correctIndex);
    if (remapped === null) return { ok: false, error: "correct" };
    correct_index = remapped;
    explanation = draft.explanation.trim() || null;
  }

  return {
    ok: true,
    payload: { kind: draft.kind, question, options, correct_index, explanation },
  };
}

// The chosen option's index among the non-blank options, or null when the
// chosen option is itself blank / out of range (nothing valid is selected).
function remapCorrectIndex(
  rawOptions: string[],
  correctIndex: number,
): number | null {
  const chosen = rawOptions[correctIndex];
  if (chosen === undefined || chosen.trim() === "") return null;
  let index = 0;
  for (let i = 0; i < correctIndex; i++) {
    if (rawOptions[i].trim() !== "") index++;
  }
  return index;
}
