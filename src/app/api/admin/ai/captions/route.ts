import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { langInstruction, type Lang } from "@/lib/ai/prompt";
import { embedPhotoRecord } from "@/lib/ai/embed-records";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  lang: z.enum(["de", "en"]).default("de"),
  onlyEmpty: z.boolean().optional().default(false),
});

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

  const { data: photos } = await supabase
    .from("photos")
    .select("id, ai_description, place_name, caption")
    .eq("post_id", postId);

  const targets = (photos ?? [])
    .filter((p) => p.ai_description || p.place_name)
    .filter((p) => (onlyEmpty ? !p.caption : true))
    .slice(0, 40);

  if (targets.length === 0) return { count: 0 };

  const list = targets
    .map((p) => `${p.id} | ${p.place_name ?? ""} | ${p.ai_description ?? ""}`)
    .join("\n");

  const raw = await deepseekChat({
    model: aiModels.fast,
    temperature: 0.5,
    json: true,
    maxTokens: 2500,
    meta: { operation: "captions", postId, userId: user.id },
    messages: [
      {
        role: "system",
        content:
          "Du textest knappe Bildunterschriften für einen Reiseblog. " +
          langInstruction(lang as Lang),
      },
      {
        role: "user",
        content:
          "Für jede Zeile (id | ort | beschreibung) erstelle eine kurze, " +
          "stimmungsvolle Bildunterschrift (caption, max ~12 Wörter), die das " +
          "Bild auch für nicht-sehende Leser erkennbar macht. Antworte als JSON: " +
          '{ "items": [ { "id": string, "caption": string } ] }\n\n' +
          list,
      },
    ],
  });
  const data = parseJsonLoose<{
    items: { id: string; caption: string }[];
  }>(raw);

  const valid = new Set(targets.map((p) => p.id));
  let count = 0;
  for (const item of data.items ?? []) {
    if (!valid.has(item.id)) continue;
    await supabase
      .from("photos")
      .update({ caption: item.caption?.trim() || null })
      .eq("id", item.id);
    // Refresh the embedding now that the caption is part of the photo's text.
    await embedPhotoRecord(supabase, item.id, {
      operation: "photo_embed",
      postId,
      userId: user.id,
    });
    count++;
  }
  return { count };
}
