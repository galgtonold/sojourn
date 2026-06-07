// Server-only photo enrichment: a German vision description + a reverse-geocoded
// place name. Both are cached on the photo row so each photo is processed once.
import "server-only";
import { env, isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels, type UsageMeta } from "@/lib/ai/deepseek";
import { reverseGeocode } from "@/lib/ai/geocode";
import { optimizedSrc } from "@/lib/utils";

export type EnrichablePhoto = {
  id: string;
  url: string | null;
  lat: number | null;
  lng: number | null;
  ai_description: string | null;
  place_name: string | null;
  enriched_at: string | null;
};

export async function describeImage(
  imageUrl: string,
  meta?: UsageMeta,
): Promise<string | null> {
  if (!isAiConfigured) return null;
  const abs = imageUrl.startsWith("http")
    ? imageUrl
    : `${env.siteUrl}${imageUrl}`;
  try {
    const text = await deepseekChat({
      model: aiModels.vision,
      temperature: 0.4,
      maxTokens: 400,
      meta,
      messages: [
        {
          role: "system",
          content:
            "Du beschreibst Reisefotos sachlich und knapp auf Deutsch für einen Reiseblog. " +
            "Nenne in 2–3 Sätzen das Motiv, die Umgebung, die Lichtstimmung und besondere Details. " +
            "Spekuliere nicht über Namen von Personen.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Beschreibe dieses Foto." },
            { type: "image_url", image_url: { url: abs } },
          ],
        },
      ],
    });
    return text.trim() || null;
  } catch {
    return null;
  }
}

/** Computes (but does not persist) enrichment for a photo, skipping fields that
 *  already have a value. */
export async function computeEnrichment(
  photo: EnrichablePhoto,
  meta?: UsageMeta,
): Promise<{
  ai_description: string | null;
  place_name: string | null;
}> {
  const needsDescription = !photo.ai_description && Boolean(photo.url);
  const needsPlace =
    !photo.place_name && photo.lat != null && photo.lng != null;

  const [description, place] = await Promise.all([
    needsDescription
      ? describeImage(optimizedSrc(photo.url as string, 1024, 70), meta)
      : Promise.resolve(photo.ai_description),
    needsPlace
      ? reverseGeocode(photo.lat as number, photo.lng as number)
      : Promise.resolve(photo.place_name),
  ]);

  return {
    ai_description: description ?? photo.ai_description,
    place_name: place ?? photo.place_name,
  };
}
