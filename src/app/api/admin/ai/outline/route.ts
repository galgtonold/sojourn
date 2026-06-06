import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { buildDossier } from "@/lib/ai/dossier";
import { langInstruction, qaBlock, type Lang } from "@/lib/ai/prompt";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
  answers: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  lang: z.enum(["de", "en"]).default("de"),
});

export type Outline = {
  title: string;
  excerpt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_photo_id: string | null;
  sections: { heading: string; beat: string; photo_ids: string[] }[];
};

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
  const { postId, notes, answers, lang } = parsed.data;

  const { error: updErr } = await supabase
    .from("posts")
    .update({ ai_notes: notes ?? null })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const dossier = await buildDossier(supabase, postId);
  if (dossier.photos.length === 0 && !notes?.trim()) {
    return NextResponse.json({ error: "Keine Fotos oder Notizen." }, { status: 400 });
  }

  try {
    const raw = await deepseekChat({
      model: aiModels.fast,
      temperature: 0.6,
      json: true,
      maxTokens: 1500,
      messages: [
        {
          role: "system",
          content:
            "Du bist Redaktionsassistent für einen Reiseblog. " +
            langInstruction(lang as Lang),
        },
        {
          role: "user",
          content:
            `Material:\n${dossier.text}${qaBlock(answers, lang as Lang)}\n\n` +
            "Erstelle einen chronologischen Gliederungsplan. Verteile ALLE oben " +
            "genannten Foto-IDs auf 3–6 Abschnitte (jedes Foto genau einmal, in " +
            "zeitlicher Reihenfolge). Antworte ausschließlich als JSON:\n" +
            '{ "title": string, "excerpt": string, "location": string, ' +
            '"lat": number|null, "lng": number|null, "cover_photo_id": string, ' +
            '"sections": [ { "heading": string, "beat": string (1 Satz, worum es geht), ' +
            '"photo_ids": string[] } ] }',
        },
      ],
    });
    const outline = parseJsonLoose<Outline>(raw);
    // Keep only real photo ids.
    const valid = new Set(dossier.photos.map((p) => p.id));
    outline.sections = (outline.sections ?? []).map((s) => ({
      ...s,
      photo_ids: (s.photo_ids ?? []).filter((id) => valid.has(id)),
    }));
    // Guarantee at least one section so the pipeline can proceed.
    if (outline.sections.length === 0) {
      outline.sections = [
        {
          heading: outline.title || "",
          beat: "",
          photo_ids: dossier.photos.map((p) => p.id),
        },
      ];
    }
    return NextResponse.json({ outline });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI error" },
      { status: 502 },
    );
  }
}
