import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Builds the reader-facing state for one interaction. Counts/answers are only
// revealed once the visitor has responded.
async function buildState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  id: string,
  token: string,
) {
  const { data: it } = await supabase
    .from("interactions")
    .select("kind, options, correct_index, explanation")
    .eq("id", id)
    .maybeSingle();
  if (!it) return null;

  const { data: mine } = await supabase
    .from("interaction_responses")
    .select("choice_index")
    .eq("interaction_id", id)
    .eq("visitor_token", token)
    .maybeSingle();

  if (mine == null) return { voted: false as const };

  const options: string[] = it.options ?? [];
  const counts = await Promise.all(
    options.map((_, i) =>
      supabase
        .from("interaction_responses")
        .select("*", { count: "exact", head: true })
        .eq("interaction_id", id)
        .eq("choice_index", i)
        .then((r: { count: number | null }) => r.count ?? 0),
    ),
  );

  return {
    voted: true as const,
    counts,
    total: counts.reduce((a, b) => a + b, 0),
    yourChoice: mine.choice_index as number,
    correctIndex: it.kind === "quiz" ? (it.correct_index ?? null) : null,
    explanation: it.kind === "quiz" ? (it.explanation ?? null) : null,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token") ?? "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ voted: false });

  const state = await buildState(supabase, id, token);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state);
}

const voteSchema = z.object({
  id: z.string().uuid(),
  token: z.string().min(8).max(64),
  choice: z.number().int().min(0).max(50),
});

export async function POST(req: Request) {
  const parsed = voteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { id, token, choice } = parsed.data;

  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ voted: false }, { status: 503 });

  // One response per visitor; ignore repeats so they can't stuff the ballot.
  await supabase
    .from("interaction_responses")
    .upsert(
      { interaction_id: id, visitor_token: token, choice_index: choice },
      { onConflict: "interaction_id,visitor_token", ignoreDuplicates: true },
    );

  const state = await buildState(supabase, id, token);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state);
}
