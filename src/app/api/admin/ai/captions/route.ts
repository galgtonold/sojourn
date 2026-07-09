import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { aiModels, deepseekJson } from "@/lib/ai/deepseek";
import { langInstruction, type Lang } from "@/lib/ai/prompt";
import { selectCaptionTargets } from "@/lib/ai/caption-select";
import { fetchCaptionSources, saveCaptions } from "@/lib/db/photos";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  lang: z.enum(["de", "en"]).default("de"),
  onlyEmpty: z.boolean().optional().default(false),
  // The article's prose, so captions echo its voice and framing rather than
  // reading like standalone image descriptions. The draft pipeline passes the
  // freshly-assembled body (not yet persisted); the standalone button omits it
  // and we fall back to the saved body.
  body: z.string().optional(),
});

// Strip photo/interaction tokens and directive fences so the model sees clean
// prose, and cap the length to keep the prompt fast.
function narrativeContext(body: string): string {
  return body
    .replace(/:::(?:poll|quiz)[\s\S]*?:::/g, "")
    .replace(/\[(?:photo|ask):[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3000);
}

// Generates a concise caption for each of a post's photos from their cached
// descriptions. The caption doubles as the image's alt text, so there's just
// one field. Usable inside the draft pipeline or as a standalone action.
export const POST = adminRoute(schema, captions, { requireAi: true });

async function captions({
  supabase,
  user,
  input,
}: AdminCtx<z.infer<typeof schema>>) {
  const { postId, lang, onlyEmpty } = input;

  // Prefer the body the caller passed (the draft pipeline, mid-assembly);
  // otherwise read what's persisted (the standalone "caption" button).
  let body = input.body ?? "";
  if (!body) {
    const { data: post } = await supabase
      .from("posts")
      .select("body")
      .eq("id", postId)
      .maybeSingle();
    body = post?.body ?? "";
  }
  const context = narrativeContext(body);

  const targets = selectCaptionTargets(
    await fetchCaptionSources(supabase, postId),
    { onlyEmpty },
  );

  if (targets.length === 0) return { count: 0 };

  const list = targets
    .map((p) => `${p.id} | ${p.place_name ?? ""} | ${p.ai_description ?? ""}`)
    .join("\n");

  const data = await deepseekJson<{
    items: { id: string; caption: string }[];
  }>({
    model: aiModels.fast,
    temperature: 0.5,
    maxTokens: 2500,
    meta: { operation: "captions", postId, userId: user.id },
    messages: [
      {
        role: "system",
        content:
          "Du textest knappe Bildunterschriften für einen persönlichen " +
          "Reiseblog – locker, im „du“, niemals förmlich. " +
          langInstruction(lang as Lang),
      },
      {
        role: "user",
        content:
          (context
            ? "Hier der Artikel, zu dem die Fotos gehören. Die Bildunterschriften " +
              "sollen in seiner Stimme und Erzählung verankert sein – greife den " +
              "Moment, den Ton und die Wortwahl des Textes auf, statt das Bild " +
              "neutral zu beschreiben:\n\n" +
              context +
              "\n\n---\n\n"
            : "") +
          "Für jede Zeile (id | ort | beschreibung) erstelle eine kurze " +
          "Bildunterschrift (caption, max ~12 Wörter), die sich wie ein Teil des " +
          "Artikels liest und das Bild zugleich für nicht-sehende Leser erkennbar " +
          "macht. Keine Wiederholung des Fließtexts, kein „Foto von …“. " +
          'Antworte als JSON: { "items": [ { "id": string, "caption": string } ] }\n\n' +
          list,
      },
    ],
  });

  // Keep only captions for photos we actually asked about (the model can echo a
  // stray id), then persist them.
  const valid = new Set(targets.map((p) => p.id));
  const items = (data.items ?? []).filter((it) => valid.has(it.id));
  const count = await saveCaptions(supabase, items, {
    postId,
    userId: user.id,
  });
  return { count };
}
