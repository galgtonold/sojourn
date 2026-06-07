import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { buildDossier } from "@/lib/ai/dossier";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
});

export const POST = adminRoute(schema, questions, { requireAi: true });

async function questions({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  // Persist notes (RLS ensures the caller may edit this post).
  const { error: updErr } = await supabase
    .from("posts")
    .update({ ai_notes: input.notes ?? null })
    .eq("id", input.postId);
  if (updErr) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dossier = await buildDossier(supabase, input.postId);

  const raw = await deepseekChat({
    model: aiModels.fast,
    temperature: 0.6,
    json: true,
    maxTokens: 700,
    meta: { operation: "questions", postId: input.postId, userId: user.id },
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
  const questionList = (data.questions ?? []).filter(Boolean).slice(0, 6);
  return { questions: questionList };
}
