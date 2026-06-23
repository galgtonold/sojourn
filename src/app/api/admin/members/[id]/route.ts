import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/api/admin-auth";

const schema = z.object({
  tripIds: z.array(z.string().uuid()).default([]),
});

/** Replace a member's set of granted trips. */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireOwner();
  if (!gate.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  }
  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { tripIds } = parsed.data;

  await admin.from("trip_members").delete().eq("user_id", id);
  if (tripIds.length > 0) {
    const { error } = await admin
      .from("trip_members")
      .insert(tripIds.map((trip_id) => ({ trip_id, user_id: id })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Remove a collaborator entirely (deletes their account; grants cascade). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const gate = await requireOwner();
  if (!gate.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: gate.status });
  }
  if (id === gate.self) {
    return NextResponse.json({ error: "cannot remove yourself" }, { status: 400 });
  }
  const admin = getAdminSupabase();
  if (!admin) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 503 });
  }

  // Never delete another owner via this endpoint.
  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (target?.role === "owner") {
    return NextResponse.json({ error: "cannot remove an owner" }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
