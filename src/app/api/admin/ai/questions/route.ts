import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, deepseekJson } from "@/lib/ai/deepseek";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
  lang: z.enum(["de", "en"]).default("de"),
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

  // The dossier already carries the trip context (its ai_context, summary and
  // sibling posts); the style guide carries the author's voice — so the
  // questions surface exactly the material this trip + style need.
  const [dossier, styleGuide] = await Promise.all([
    buildDossier(supabase, input.postId),
    buildStyleGuide(supabase, input.postId),
  ]);

  const data = await deepseekJson<{ questions: string[] }>({
    model: aiModels.fast,
    temperature: 0.6,
    maxTokens: 1200,
    meta: { operation: "questions", postId: input.postId, userId: user.id },
    messages: [
      {
        role: "system",
        content:
          input.lang === "en"
            ? "You are an editorial assistant for a travel blog. Write everything in English."
            : "Du bist Redaktionsassistent für einen Reiseblog. Antworte auf Deutsch.",
      },
      {
        role: "user",
        content:
          input.lang === "en"
            ? "Write ALL of your questions in ENGLISH. The author's style guide " +
              "below may be in German — match its tone and personality, but the " +
              "questions themselves MUST be written in English.\n\n" +
              `Here is the material for a planned post:\n\n${dossier.text}\n\n` +
              `The author's writing style (the style the post will be written in):\n${styleGuide}\n\n` +
              "Ask 4–6 short, concrete questions whose answers you need to write a " +
              "vivid, personal post in exactly this style (e.g. who came along, a " +
              "highlight, an anecdote, the mood, the motivation). Only ask about " +
              "things the material does NOT already reveal. Use the photo " +
              "descriptions and ask specifically about what is NOT visible in the " +
              "photos — backgrounds, feelings, the moments in between — not the " +
              "obviously visible. Do NOT ask about the weather or the exact " +
              "location: both are filled in automatically from weather and route/GPS data. " +
              'Reply ONLY as JSON: {"questions": ["…", "…"]}.'
            : `Hier ist das Material für einen geplanten Beitrag:\n\n${dossier.text}\n\n` +
              `So schreibt der Autor (Stil des späteren Beitrags):\n${styleGuide}\n\n` +
              "Stelle 4–6 kurze, konkrete Fragen, deren Antworten du brauchst, um " +
              "einen lebendigen, persönlichen Beitrag in genau diesem Stil zu " +
              "schreiben (z. B. Begleitung, Höhepunkt, eine Anekdote, Stimmung, " +
              "Beweggrund). Frage nur nach Dingen, die aus dem Material nicht " +
              "hervorgehen. Nutze die Fotobeschreibungen und frage gezielt nach dem, " +
              "was man auf den Fotos NICHT sieht — Hintergründe, Gefühle, Momente " +
              "dazwischen —, nicht nach offensichtlich Sichtbarem. Frage NICHT nach " +
              "dem Wetter und NICHT nach dem genauen Ort: beide werden automatisch " +
              "aus Wetter- und Routen-/GPS-Daten ergänzt. " +
              'Antworte ausschließlich als JSON: {"questions": ["…", "…"]}.',
      },
    ],
  });
  const questionList = (data.questions ?? []).filter(Boolean).slice(0, 6);
  return { questions: questionList };
}
