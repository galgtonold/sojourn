import { NextResponse } from "next/server";
import { searchAll } from "@/lib/content";
import { logError } from "@/lib/log";

// Query-driven; embeds the query once and runs the story + photo hybrid searches
// in parallel. Returns raw results (with i18n overlays) for client localization.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  try {
    const data = await searchAll(q);
    return NextResponse.json(data);
  } catch (e) {
    // Surface a 500 (so the client shows its retry state) and log it, rather
    // than depending on every callee in the chain catching internally.
    logError("api.search", e);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
