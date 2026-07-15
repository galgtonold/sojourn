import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, deepseekJson } from "@/lib/ai/deepseek";

export const maxDuration = 60;

const schema = z.object({
  mode: z.enum(["questions", "refine"]),
  tripId: z.string().uuid().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  context: z.string().optional(),
  answers: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

export const POST = adminRoute(schema, tripContext, { requireAi: true });

async function tripContext({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  // Pull the trip's existing posts (if saved) for richer grounding.
  let postLines = "";
  if (input.tripId) {
    const { data } = await supabase
      .from("posts")
      .select("title, location")
      .eq("trip_id", input.tripId)
      .limit(40);
    if (data?.length) {
      postLines =
        "Bestehende Beiträge dieser Reise:\n" +
        data
          .map((p) => `- ${p.title}${p.location ? ` (${p.location})` : ""}`)
          .join("\n");
    }
  }

  const material = [
    input.title ? `Reise: ${input.title}` : "",
    input.summary ? `Öffentliche Zusammenfassung: ${input.summary}` : "",
    input.context?.trim()
      ? `Aktueller interner Kontext:\n${input.context.trim()}`
      : "(Noch kein interner Kontext.)",
    postLines,
  ]
    .filter(Boolean)
    .join("\n\n");

  if (input.mode === "questions") {
    const data = await deepseekJson<{ questions: string[] }>({
      model: "fast",
      temperature: 0.6,
      maxTokens: 600,
      meta: { operation: "trip-context-questions", userId: user.id },
      messages: [
        {
          role: "system",
          content:
            "Du bist Redaktionsassistent für einen Reiseblog. Antworte auf Deutsch.",
        },
        {
          role: "user",
          content:
            `${material}\n\n` +
            "Dieser interne Kontext dient ausschließlich als Quelle, um KI-Beiträge " +
            "für diese Reise zu generieren (nicht öffentlich sichtbar). Stelle 4–6 " +
            "kurze, konkrete Fragen, deren Antworten den Kontext deutlich nützlicher " +
            "machen — z. B. wer mitreist (Namen, Beziehung), Motivation und Ziele, " +
            "Reisestil, Ausrüstung, wiederkehrende Themen, Insider-Details. Frage nur " +
            "nach Dingen, die noch fehlen. " +
            'Antworte ausschließlich als JSON: {"questions": ["…"]}.',
        },
      ],
    });
    return { questions: (data.questions ?? []).filter(Boolean).slice(0, 6) };
  }

  const qa = (input.answers ?? [])
    .filter((a) => a.answer.trim())
    .map((a) => `F: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  const context = await deepseekChat({
    model: "fast",
    temperature: 0.5,
    maxTokens: 900,
    meta: { operation: "trip-context-refine", userId: user.id },
    messages: [
      {
        role: "system",
        content:
          "Du bist Redaktionsassistent für einen Reiseblog. Antworte auf Deutsch.",
      },
      {
        role: "user",
        content:
          `${material}\n\n` +
          (qa ? `Antworten des Autors:\n${qa}\n\n` : "") +
          "Schreibe einen verdichteten internen Kontext für diese Reise. Er wird " +
          "NUR als Quelle für die KI-Generierung der Beiträge genutzt und ist nicht " +
          "öffentlich. Fasse Teilnehmer, Motivation/Ziele, Reisestil und prägnante " +
          "Details in klaren Stichpunkten oder kurzen Absätzen zusammen. Integriere " +
          "den bestehenden Kontext und die Antworten. Gib NUR den Kontext-Text " +
          "zurück, ohne Vorrede und ohne Anführungszeichen.",
      },
    ],
  });
  return { context: context.trim() };
}
