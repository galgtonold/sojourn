import { NextResponse } from "next/server";
import { searchAll } from "@/lib/content";

// Query-driven; embeds the query once and runs the story + photo hybrid searches
// in parallel. Returns raw results (with i18n overlays) for client localization.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const data = await searchAll(q);
  return NextResponse.json(data);
}
