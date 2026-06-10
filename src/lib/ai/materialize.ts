// Server-only: turns well-formed inline :::poll / :::quiz blocks into rows in
// the `interactions` table and rewrites them to [ask:<id>] tags. Malformed
// blocks are left untouched so they surface as errors in the editor/preview.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseDirectives } from "@/lib/interactions-parse";

export async function materializeInteractions(
  supabase: SupabaseClient,
  postId: string,
  body: string,
): Promise<{ body: string; created: number }> {
  const directives = parseDirectives(body).filter((d) => d.problems.length === 0);
  if (directives.length === 0) return { body, created: 0 };

  // Append after any existing interactions for this post.
  const { data: last } = await supabase
    .from("interactions")
    .select("sort_order")
    .eq("post_id", postId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let sort = (last?.sort_order ?? -1) + 1;

  // Insert in document order, collecting the [ask:id] replacement per span.
  const replacements: { start: number; end: number; tag: string }[] = [];
  let created = 0;
  for (const d of directives) {
    const { data, error } = await supabase
      .from("interactions")
      .insert({
        post_id: postId,
        kind: d.kind,
        question: d.question,
        options: d.options,
        correct_index: d.kind === "quiz" ? d.correctIndex : null,
        explanation: d.kind === "quiz" ? d.explanation : null,
        sort_order: sort++,
      })
      .select("id")
      .single();
    if (error || !data) continue; // leave the block in place on failure
    replacements.push({ start: d.start, end: d.end, tag: `[ask:${data.id}]` });
    created++;
  }

  // Splice from the end so earlier offsets stay valid.
  let out = body;
  for (const r of replacements.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, r.start) + r.tag + out.slice(r.end);
  }
  return { body: out, created };
}

const ASK_TAG_RE = /\[ask:([^\]\s]+)\]/g;

// Deletes a post's interactions that the (already materialised) body no longer
// references — e.g. a quiz from a previous draft that a regenerate replaced.
// Without this, stale interactions linger and pollute the trip's sibling
// context. Refs may be an id or a 1-based index (matching resolveInteraction).
export async function pruneUnreferencedInteractions(
  supabase: SupabaseClient,
  postId: string,
  body: string,
): Promise<{ deleted: number }> {
  const { data } = await supabase
    .from("interactions")
    .select("id")
    .eq("post_id", postId)
    .order("sort_order", { ascending: true });
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return { deleted: 0 };

  const refs = new Set<string>();
  const re = new RegExp(ASK_TAG_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) refs.add(m[1]);

  const stale = rows
    .filter((r, idx) => !refs.has(r.id) && !refs.has(String(idx + 1)))
    .map((r) => r.id);
  if (stale.length === 0) return { deleted: 0 };

  const { error } = await supabase
    .from("interactions")
    .delete()
    .in("id", stale);
  return { deleted: error ? 0 : stale.length };
}
