import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoute, type AdminCtx } from "@/lib/api/admin-route";
import { deepseekChat, type ChatMessage } from "@/lib/ai/deepseek";
import { getViewer } from "@/lib/auth";

export const maxDuration = 180;

const schema = z.object({});

export const POST = adminRoute(schema, proposeStyle, { requireAi: true });

// Distils a draft writing-style guide from the author's recent posts so they
// have a starting point to edit, rather than describing their own voice cold.
// Owner-only: the style guide is a blog-wide setting, not a per-member one.
async function proposeStyle({ supabase, user }: AdminCtx<z.infer<typeof schema>>) {
  const viewer = await getViewer();
  if (!viewer.isOwner)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data } = await supabase
    .from("posts")
    .select("title, body")
    .eq("published", true)
    .order("published_at", { ascending: false })
    .limit(4);

  const samples = (data ?? [])
    .map((p) => `### ${p.title}\n${(p.body ?? "").slice(0, 1500)}`)
    .join("\n\n");

  const system =
    "Du bist ein erfahrener Lektor. Analysiere die Schreibstimme des Autors und " +
    "fasse sie als knappen, umsetzbaren Stil-Leitfaden zusammen: Ton, Perspektive, " +
    "Satzrhythmus, typischer Wortschatz, Eigenheiten, Dos & Don'ts. Antworte auf " +
    "Deutsch als 6–10 kurze Stichpunkte (jeweils eine Zeile mit „- “), ohne Vorrede.";
  const userMsg = samples
    ? `Frühere Beiträge des Autors:\n\n${samples}`
    : "Es gibt noch keine veröffentlichten Beiträge. Schlage einen warmen, persönlichen Reisetagebuch-Stil als Ausgangspunkt vor.";

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userMsg },
  ];

  // Use the fast model: a style distillation needs no deep reasoning, and the
  // reasoner would spend far more of the budget on chain-of-thought. But BOTH
  // models emit reasoning_content before the answer and BOTH count it against
  // the cap, so the cap must clear the thinking with room to spare — under the
  // old 800 the budget went entirely to reasoning and the content came back
  // empty. See the reasoning-cap gotcha in CLAUDE.md.
  const style = await deepseekChat({
    model: "fast",
    temperature: 0.5,
    maxTokens: 8000,
    messages,
    meta: { operation: "style-guide", userId: user.id },
  });

  return { style: style.trim() };
}
