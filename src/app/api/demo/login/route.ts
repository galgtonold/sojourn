// One-click sign-in for the showcase deployment.
//
// The credentials stay on the server: a client-side signInWithPassword would
// ship the demo password in the browser bundle, where it outlives the demo and
// gets tried against every other Sojourn install on the internet. Here the
// browser only ever POSTs to this route, and what comes back is a session
// cookie — the same one a normal sign-in would set.
//
// The account it signs in as is a real owner, so the visitor sees every admin
// screen. It can't write anything: demo mode refuses mutations in middleware,
// for everyone (see @/lib/demo).
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  // Not a demo deployment: behave as though the route doesn't exist, so a
  // self-hosted install offers no extra door to knock on.
  if (!env.demoMode || !env.demoEmail || !env.demoPassword) {
    return new NextResponse(null, { status: 404 });
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: env.demoEmail,
    password: env.demoPassword,
  });
  if (error) {
    // The visitor can do nothing about a misconfigured demo account, so don't
    // hand them Supabase's wording — it only ever means we broke the deploy.
    console.error("demo sign-in failed:", error.message);
    return NextResponse.json({ error: "demo-unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
