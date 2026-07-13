import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

export type InteractionAnalytics = {
  id: string;
  kind: "poll" | "quiz";
  question: string;
  options: string[];
  correctIndex: number | null;
  postId: string | null;
  postTitle: string;
  postSlug: string | null;
  createdAt: string;
  counts: number[]; // votes per option index (length = options.length)
  total: number;
};

/**
 * Every poll & quiz with its anonymous vote tally, for the admin analytics page.
 * Uses the SERVICE ROLE so each interaction shows its article title regardless of
 * the viewer's per-trip post access (the posts join is RLS-scoped under the authed
 * client); safe because `/admin` is gated by middleware. Votes carry no identity
 * (visitor_token), so only the distribution is available. Returns [] when the
 * service role isn't configured.
 */
export async function loadInteractionAnalytics(): Promise<InteractionAnalytics[]> {
  const supabase = getAdminSupabase();
  if (!supabase) return [];

  const { data: rows } = await supabase
    .from("interactions")
    .select(
      "id, post_id, kind, question, options, correct_index, created_at, posts(id, title, slug)",
    )
    .order("created_at", { ascending: false });
  if (!rows) return [];

  // One query for all responses, tallied in memory (no COUNT-per-option N+1).
  const { data: responses } = await supabase
    .from("interaction_responses")
    .select("interaction_id, choice_index");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = rows as any[];
  const counts = new Map<string, number[]>();
  for (const r of list) {
    counts.set(r.id as string, new Array((r.options ?? []).length).fill(0));
  }
  for (const resp of (responses ?? []) as {
    interaction_id: string;
    choice_index: number | null;
  }[]) {
    const arr = counts.get(resp.interaction_id);
    const i = resp.choice_index;
    if (arr && i != null && i >= 0 && i < arr.length) arr[i] += 1;
  }

  return list.map((r) => {
    const post = Array.isArray(r.posts) ? r.posts[0] : r.posts;
    const c = counts.get(r.id as string) ?? [];
    return {
      id: r.id as string,
      kind: (r.kind as "poll" | "quiz") ?? "poll",
      question: (r.question as string) ?? "",
      options: (r.options ?? []) as string[],
      correctIndex: (r.correct_index as number | null) ?? null,
      postId: post?.id ?? null,
      postTitle: post?.title ?? "—",
      postSlug: post?.slug ?? null,
      createdAt: r.created_at as string,
      counts: c,
      total: c.reduce((a: number, b: number) => a + b, 0),
    };
  });
}
