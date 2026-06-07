import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { isAiConfigured } from "@/lib/env";
import { deepseekChat, aiModels, parseJsonLoose } from "@/lib/ai/deepseek";
import { langInstruction, type Lang } from "@/lib/ai/prompt";

export const maxDuration = 60;

const schema = z.object({
  postId: z.string().uuid(),
  lang: z.enum(["de", "en"]).default("de"),
  onlyEmpty: z.boolean().optional().default(false),
});

// Generates concise captions + alt text for a post's photos from their cached
// descriptions. Usable inside the draft pipeline or as a standalone action.
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
  const { postId, lang, onlyEmpty } = parsed.data;

  const { data: photos } = await supabase
    .from("photos")
    .select("id, ai_description, place_name, caption, alt")
    .eq("post_id", postId);

  const targets = (photos ?? [])
    .filter((p) => p.ai_description || p.place_name)
    .filter((p) => (onlyEmpty ? !p.caption || !p.alt : true))
    .slice(0, 40);

  if (targets.length === 0) return NextResponse.json({ count: 0 });

  const list = targets
    .map((p) => `${p.id} | ${p.place_name ?? ""} | ${p.ai_description ?? ""}`)
    .join("\n");

  try {
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
            "stimmungsvolle Bildunterschrift (caption, max ~12 Wörter) und einen " +
            "sachlichen Alt-Text (alt). Antworte als JSON: " +
            '{ "items": [ { "id": string, "caption": string, "alt": string } ] }\n\n' +
            list,
        },
      ],
    });
    const data = parseJsonLoose<{
      items: { id: string; caption: string; alt: string }[];
    }>(raw);

    const valid = new Set(targets.map((p) => p.id));
    let count = 0;
    for (const item of data.items ?? []) {
      if (!valid.has(item.id)) continue;
      await supabase
        .from("photos")
        .update({
          caption: item.caption?.trim() || null,
          alt: item.alt?.trim() || null,
        })
        .eq("id", item.id);
      count++;
    }
    return NextResponse.json({ count });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "AI error" },
      { status: 502 },
    );
  }
}
