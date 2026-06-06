import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels } from "@/lib/ai/deepseek";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { langInstruction, qaBlock, type Lang } from "@/lib/ai/prompt";

export const maxDuration = 60;

const sectionSchema = z.object({
  heading: z.string(),
  beat: z.string().optional().default(""),
  photo_ids: z.array(z.string()).default([]),
});

const schema = z.object({
  postId: z.string().uuid(),
  index: z.number().int().min(0),
  total: z.number().int().min(1),
  title: z.string().optional().default(""),
  section: sectionSchema,
  notes: z.string().optional(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  lang: z.enum(["de", "en"]).default("de"),
});

export async function POST(req: Request) {
  const supabase = await getServerSupabase();
  if (!supabase) return NextResponse.json({ error: "not configured" }, { status: 503 });
  if (!isAiConfigured)
    return NextResponse.json({ error: "AI is not configured" }, { status: 503 });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { postId, index, total, title, section, notes, answers, lang } = parsed.data;

  const [dossier, styleGuide] = await Promise.all([
    buildDossier(supabase, postId),
    buildStyleGuide(supabase, postId),
  ]);

  const byId = new Map(dossier.photos.map((p) => [p.id, p]));
  const photoLines = section.photo_ids
    .map((id) => {
      const p = byId.get(id);
      if (!p) return null;
      return `[photo:${id}] — ${p.place_name ?? ""} — ${p.ai_description ?? ""}`;
    })
    .filter(Boolean)
    .join("\n");

  const system =
    "Du bist ein erfahrener Reiseblog-Autor. " +
    langInstruction(lang as Lang) +
    "\n" +
    styleGuide +
    "\n\nRegeln:\n" +
    "- Erfinde keine Fakten oder Namen; stütze dich nur auf das Material.\n" +
    "- Beginne mit einer Markdown-Zwischenüberschrift (## …). Kein H1, kein Titel.\n" +
    "- Setze die angegebenen [photo:ID]-Tags jeweils in eine eigene Zeile, dort wo sie passen.\n" +
    "- Schreibe NUR diesen einen Abschnitt, ohne Wiederholung. Antworte mit reinem Markdown (kein JSON).";

  const userPrompt =
    `Beitragstitel: ${title}\n` +
    `Abschnitt ${index + 1} von ${total}: ${section.heading}\n` +
    `Worum es geht: ${section.beat}\n\n` +
    `Fotos für diesen Abschnitt:\n${photoLines || "(keine)"}\n` +
    `${qaBlock(answers, lang as Lang)}` +
    (notes?.trim() ? `\n\nNotizen: ${notes.trim()}` : "");

  try {
    const markdown = await deepseekChat({
      model: aiModels.reasoner,
      temperature: 0.8,
      maxTokens: 3000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    return NextResponse.json({ markdown: markdown.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI error" },
      { status: 502 },
    );
  }
}
