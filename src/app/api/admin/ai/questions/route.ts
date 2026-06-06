import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { buildDossier } from "@/lib/ai/dossier";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!isAiConfigured) {
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // Persist notes (RLS ensures the caller may edit this post).
  const { error: updErr } = await supabase
    .from("posts")
    .update({ ai_notes: parsed.data.notes ?? null })
    .eq("id", parsed.data.postId);
  if (updErr) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dossier = await buildDossier(supabase, parsed.data.postId);

  try {
    const raw = await deepseekChat({
      model: aiModels.fast,
      temperature: 0.6,
      json: true,
      maxTokens: 700,
      messages: [
        {
          role: "system",
          content:
            "Du bist Redaktionsassistent für einen Reiseblog. Antworte auf Deutsch.",
        },
        {
          role: "user",
          content:
            `Hier ist das Material für einen geplanten Beitrag:\n\n${dossier.text}\n\n` +
            "Stelle 4–6 kurze, konkrete Fragen, deren Antworten du brauchst, um " +
            "einen lebendigen, persönlichen Beitrag zu schreiben (z. B. Begleitung, " +
            "Höhepunkt, eine Anekdote, Wetter/Stimmung, Beweggrund). Frage nur nach " +
            "Dingen, die aus dem Material nicht hervorgehen. " +
            'Antworte ausschließlich als JSON: {"questions": ["…", "…"]}.',
        },
      ],
    });
    const data = parseJsonLoose<{ questions: string[] }>(raw);
    const questions = (data.questions ?? []).filter(Boolean).slice(0, 6);
    return NextResponse.json({ questions });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI error" },
      { status: 502 },
    );
  }
}
