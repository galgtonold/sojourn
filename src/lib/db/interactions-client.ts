// Browser-side writes to a poll or quiz, for the proofreader's "apply".
//
// The interaction editor persists a whole row when the author saves a block.
// A proofreading fix is narrower — one word inside one field — so this touches
// exactly the field the finding named and leaves the rest of the row alone.
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ProofTarget } from "@/lib/ai/proofread";
import type { ManagedInteraction } from "@/components/interaction-manager";

/**
 * Apply one proofreading fix to a poll or quiz and return the updated list, or
 * null if nothing changed (unknown id, out-of-range option, no client).
 *
 * The caller keeps the list in React state, so the new array goes back rather
 * than a refetch: the manager is uncontrolled and would otherwise show stale
 * text until something else forced it to re-read.
 */
export async function applyInteractionFix(
  target: Extract<
    ProofTarget,
    { kind: "question" | "explanation" | "option" }
  >,
  value: string,
  list: ManagedInteraction[],
): Promise<ManagedInteraction[] | null> {
  const supabase = getBrowserSupabase();
  if (!supabase) return null;

  const current = list.find((i) => i.id === target.interactionId);
  if (!current) return null;

  let patch: Partial<ManagedInteraction>;
  if (target.kind === "question") {
    patch = { question: value };
  } else if (target.kind === "explanation") {
    patch = { explanation: value };
  } else {
    // Options are a JSON array: replace the one element, keep the order, and
    // refuse an index that is no longer there rather than growing the array.
    if (target.index >= current.options.length) return null;
    patch = {
      options: current.options.map((o, i) => (i === target.index ? value : o)),
    };
  }

  const { error } = await supabase
    .from("interactions")
    .update(patch)
    .eq("id", target.interactionId);
  if (error) return null;

  return list.map((i) =>
    i.id === target.interactionId ? { ...i, ...patch } : i,
  );
}
