// Server-only: a short "story so far" brief distilled from a trip's PRIOR days,
// so writing a later day can reference ongoing situations (an injury, a plan)
// without the author restating them. Best-effort: returns "" when there are no
// prior days, no trip, AI isn't configured, or the call fails.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAiConfig } from "@/lib/ai-config";
import { deepseekChat } from "@/lib/ai/deepseek";
import { stripRefTags } from "@/lib/references";

const FENCES = /:::(?:poll|quiz)[\s\S]*?:::/g;

// A day counts as "prior" when it has a parseable date before this post's. When
// this post has no date yet (a fresh undated draft — usually the latest day
// being written), every dated sibling counts as prior. Sorted oldest-first.
export function selectPriorDays<T extends { published_at: string | null }>(
  siblings: T[],
  currentPublishedAt: string | null,
): T[] {
  const cur = currentPublishedAt ? Date.parse(currentPublishedAt) : null;
  return siblings
    .filter((s) => s.published_at != null && !Number.isNaN(Date.parse(s.published_at)))
    .filter((s) => cur == null || Date.parse(s.published_at as string) < cur)
    .sort(
      (a, b) =>
        Date.parse(a.published_at as string) - Date.parse(b.published_at as string),
    );
}

// A day's body as clean prose: media/interaction tokens and :::poll/:::quiz
// fences removed, whitespace collapsed.
export function stripBody(body: string): string {
  return stripRefTags(body.replace(FENCES, "")).replace(/\s+/g, " ").trim();
}

// The summarizer's input: trip context, then one section per prior day (each
// body trimmed), capped so the call stays fast.
export function briefInput(
  priorDays: { title: string | null; body: string | null; published_at: string | null }[],
  trip: { summary?: string | null; ai_context?: string | null } | null,
): string {
  const parts: string[] = [];
  if (trip?.summary?.trim()) parts.push(`Reise-Kontext: ${trip.summary.trim()}`);
  if (trip?.ai_context?.trim()) parts.push(`Reise-Hintergrund (Autor): ${trip.ai_context.trim()}`);
  for (const d of priorDays) {
    const body = stripBody(d.body ?? "").slice(0, 2500);
    if (!body) continue;
    const date = d.published_at ? d.published_at.slice(0, 10) : "";
    parts.push(`## ${d.title ?? "Tag"}${date ? ` — ${date}` : ""}\n${body}`);
  }
  return parts.join("\n\n").slice(0, 12000);
}

const SYSTEM_BRIEF =
  "Du fasst den bisherigen Verlauf einer mehrtägigen Reise zusammen — als " +
  "Gedächtnisstütze, damit der nächste Tag an die vorigen anknüpfen kann. Nenne " +
  "knapp und konkret: wiederkehrende Personen (Name + ein Merkmal); laufende " +
  "Situationen, die noch offen sind (Verletzungen, Gesundheit, Pläne, Logistik); " +
  "wiederkehrende Motive oder Running Gags; und eine kurze Zeitleiste (ein Satz " +
  "pro Tag: was ist passiert). Halte dich strikt ans Material, erfinde nichts. " +
  "Ziel: ca. 150–250 Wörter in klarer Stichwort- oder Kurzsatzform.";

export async function buildTripBrief(
  supabase: SupabaseClient,
  postId: string,
  meta?: { userId?: string | null },
): Promise<string> {
  const cfg = await getAiConfig();
  if (!cfg.isAiConfigured) return "";
  const { data: post } = await supabase
    .from("posts")
    .select("published_at, trip_id, trips(summary, ai_context)")
    .eq("id", postId)
    .maybeSingle();
  if (!post?.trip_id) return "";

  const { data: siblings } = await supabase
    .from("posts")
    .select("title, body, published_at")
    .eq("trip_id", post.trip_id)
    .neq("id", postId);

  const prior = selectPriorDays(siblings ?? [], post.published_at);
  if (prior.length === 0) return "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trip = (Array.isArray((post as any).trips) ? (post as any).trips[0] : (post as any).trips) as
    | { summary?: string | null; ai_context?: string | null }
    | null;
  const input = briefInput(prior, trip ?? null);
  if (!input.trim()) return "";

  try {
    const brief = await deepseekChat({
      model: "fast",
      temperature: 0.3,
      maxTokens: 1500,
      meta: { operation: "trip_brief", postId, userId: meta?.userId },
      messages: [
        { role: "system", content: SYSTEM_BRIEF },
        { role: "user", content: input },
      ],
    });
    return brief.trim();
  } catch {
    return "";
  }
}
