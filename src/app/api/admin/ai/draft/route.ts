import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { buildDossier, buildStyleGuide } from "@/lib/ai/dossier";
import { computeEnrichment } from "@/lib/ai/enrich";

export const maxDuration = 300;

const schema = z.object({
  postId: z.string().uuid(),
  notes: z.string().optional(),
  answers: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
});

type DraftOut = {
  title?: string;
  excerpt?: string;
  location?: string;
  lat?: number | null;
  lng?: number | null;
  cover_photo_id?: string;
  body?: string;
  photos?: { id: string; caption?: string; alt?: string }[];
};

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
  const { postId, notes, answers } = parsed.data;

  const { error: updErr } = await supabase
    .from("posts")
    .update({ ai_notes: notes ?? null })
    .eq("id", postId);
  if (updErr) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Safety net: enrich any photos that the background pass hasn't reached yet.
  try {
    const { data: missing } = await supabase
      .from("photos")
      .select("id, url, lat, lng, ai_description, place_name, enriched_at")
      .eq("post_id", postId)
      .is("enriched_at", null);
    if (missing?.length) {
      await Promise.all(
        missing.map(async (p) => {
          const e = await computeEnrichment(p);
          await supabase
            .from("photos")
            .update({ ...e, enriched_at: new Date().toISOString() })
            .eq("id", p.id);
        }),
      );
    }
  } catch {
    /* best effort */
  }

  const [dossier, styleGuide] = await Promise.all([
    buildDossier(supabase, postId),
    buildStyleGuide(supabase, postId),
  ]);

  if (dossier.photos.length === 0 && !notes?.trim()) {
    return NextResponse.json(
      { error: "Keine Fotos oder Notizen vorhanden." },
      { status: 400 },
    );
  }

  const validIds = new Set(dossier.photos.map((p) => p.id));
  const qa =
    answers && answers.length
      ? "\n\nAntworten des Autors:\n" +
        answers.map((a) => `F: ${a.question}\nA: ${a.answer}`).join("\n\n")
      : "";

  const system =
    "Du bist ein erfahrener Reiseblog-Autor und schreibst auf Deutsch. " +
    styleGuide +
    "\n\nRegeln:\n" +
    "- Erfinde keine Fakten, Namen oder Ereignisse. Stütze dich nur auf das Material und die Antworten; wenn etwas unklar ist, bleibe allgemein.\n" +
    "- Erzähle chronologisch entlang der Foto-Zeitleiste.\n" +
    "- Binde Fotos ein, indem du [photo:ID] mit den EXAKTEN, vorgegebenen IDs jeweils in eine eigene Zeile setzt.\n" +
    "- Nutze Markdown (## Zwischenüberschriften, Absätze). Kein H1.\n" +
    "- Gib für jedes verwendete Foto eine knappe Bildunterschrift (caption) und einen Alt-Text auf Deutsch an.\n" +
    "- Antworte AUSSCHLIESSLICH mit gültigem JSON, ohne Erklärung.";

  const userPrompt =
    `Material:\n${dossier.text}${qa}\n\n` +
    "Erstelle einen vollständigen Beitrag als JSON mit genau diesen Feldern:\n" +
    "{\n" +
    '  "title": string,\n' +
    '  "excerpt": string (1–2 Sätze),\n' +
    '  "location": string (menschlich lesbarer Ort),\n' +
    '  "lat": number|null, "lng": number|null,\n' +
    '  "cover_photo_id": string (eine der vorgegebenen Foto-IDs),\n' +
    '  "body": string (Markdown mit [photo:ID]-Tags),\n' +
    '  "photos": [{ "id": string, "caption": string, "alt": string }]\n' +
    "}";

  let out: DraftOut;
  try {
    const raw = await deepseekChat({
      model: aiModels.reasoner,
      temperature: 0.8,
      maxTokens: 8000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
    });
    out = parseJsonLoose<DraftOut>(raw);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI error" },
      { status: 502 },
    );
  }

  if (!out.body || !out.title) {
    return NextResponse.json({ error: "Leeres Ergebnis vom Modell." }, { status: 502 });
  }

  // Resolve cover + location, with photo-based fallbacks.
  const cover =
    dossier.photos.find((p) => p.id === out.cover_photo_id && p.url) ??
    dossier.photos.find((p) => p.url);

  const update: Record<string, unknown> = {
    title: out.title.trim(),
    excerpt: out.excerpt?.trim() || null,
    body: out.body,
    location: out.location?.trim() || cover?.place_name || null,
    lat: out.lat ?? cover?.lat ?? null,
    lng: out.lng ?? cover?.lng ?? null,
  };
  if (cover?.url) update.cover_image = cover.url;

  const { error: postErr } = await supabase
    .from("posts")
    .update(update)
    .eq("id", postId);
  if (postErr) {
    return NextResponse.json({ error: postErr.message }, { status: 500 });
  }

  // Apply captions/alt to the referenced photos.
  for (const p of out.photos ?? []) {
    if (!validIds.has(p.id)) continue;
    await supabase
      .from("photos")
      .update({
        caption: p.caption?.trim() || null,
        alt: p.alt?.trim() || null,
      })
      .eq("id", p.id);
  }

  return NextResponse.json({ ok: true });
}
