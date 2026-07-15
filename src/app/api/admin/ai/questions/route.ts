import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekJson } from "@/lib/ai/deepseek";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { questionsPrompt, normalizeQuestions, type Lang } from "@/lib/ai/prompt";

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

  const data = await deepseekJson<{ questions: unknown }>({
    model: "fast",
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
        content: questionsPrompt(dossier.text, styleGuide, input.lang as Lang),
      },
    ],
  });
  return { questions: normalizeQuestions(data.questions) };
}
