import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { getReaderLocale } from "@/lib/i18n-server";
import type { Locale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type AdminSupabase = NonNullable<ReturnType<typeof getAdminSupabase>>;

// Builds the reader-facing state for one interaction. The tally rides along even
// before voting — so the client can show an accurate result the instant you vote
// (no "you're the only one" flash) — but the UI keeps it hidden until you do. The
// quiz's correct answer and explanation stay server-side until you've answered.
async function buildState(
  supabase: AdminSupabase,
  id: string,
  token: string,
  locale: Locale,
) {
  const { data: it } = await supabase
    .from("interactions")
    .select("kind, options, correct_index, explanation, i18n")
    .eq("id", id)
    .maybeSingle();
  if (!it) return null;

  const { data: mine } = await supabase
    .from("interaction_responses")
    .select("choice_index")
    .eq("interaction_id", id)
    .eq("visitor_token", token)
    .maybeSingle();

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
  const total = counts.reduce((a, b) => a + b, 0);

  // The quiz's correct answer + explanation ride along even before voting — like
  // the tally — so the verdict can render the instant you answer (no round-trip,
  // no wrong-looking flash). The UI keeps them hidden until you've answered.
  const quiz =
    it.kind === "quiz"
      ? {
          correctIndex: it.correct_index ?? null,
          explanation:
            (
              it.i18n as Record<string, { explanation?: string | null }> | null
            )?.[locale]?.explanation ??
            it.explanation ??
            null,
        }
      : { correctIndex: null, explanation: null };

  if (mine == null) return { voted: false as const, counts, total, ...quiz };

  return {
    voted: true as const,
    counts,
    total,
    yourChoice: mine.choice_index as number,
    ...quiz,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const token = url.searchParams.get("token") ?? "";
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const supabase = getAdminSupabase();
  if (!supabase) return NextResponse.json({ voted: false });

  const state = await buildState(supabase, id, token, await getReaderLocale());
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

  const state = await buildState(supabase, id, token, await getReaderLocale());
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state);
}
