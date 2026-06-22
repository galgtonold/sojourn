import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSupabase } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  audience: z.enum(["admin", "viewer"]).default("viewer"),
  userAgent: z.string().optional(),
});

async function getUser() {
  const supabase = await getServerSupabase();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export async function POST(req: Request) {
  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { endpoint, keys, audience, userAgent } = parsed.data;

  // Admin subscriptions require an authenticated user (owner OR collaborator);
  // viewer subscriptions are open to anyone (it's their own browser opting in).
  const user = await getUser();
  if (audience === "admin" && !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      audience,
      user_agent: userAgent ?? null,
      // Tag admin subscriptions with the subscriber so comment alerts can be
      // scoped to a collaborator's accessible posts. Viewers stay anonymous.
      user_id: audience === "admin" ? user?.id ?? null : null,
    },
    { onConflict: "endpoint" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const { endpoint } = (await req.json().catch(() => ({}))) as {
    endpoint?: string;
  };
  if (!endpoint) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Anyone may remove their own endpoint (it identifies their browser).
  const admin = getAdminSupabase();
  if (!admin) return NextResponse.json({ error: "unconfigured" }, { status: 503 });

  await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
