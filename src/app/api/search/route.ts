import { rateLimit, clientIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { searchAll } from "@/lib/content";
import { logError } from "@/lib/log";

// Query-driven; embeds the query once and runs the story + photo hybrid searches
// in parallel. Returns raw results (with i18n overlays) for client localization.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Every call embeds the query — a billed provider request on a GET anyone can
  // make, with no session and no token. It was the only public endpoint without
  // a ceiling. Search is submit-driven and the client caches per query, so a
  // reader makes a handful a minute; 20 is far above that and well below what a
  // loop would want. Tighter than reactions (40) because each one costs money.
  if (!(await rateLimit(`search:${clientIp(req)}`, 20, 60_000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
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
