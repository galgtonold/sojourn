import { NextResponse } from "next/server";
import { z } from "zod";
import { ownerRoute } from "@/lib/api/owner-route";

const putSchema = z.object({
  tripIds: z.array(z.string().uuid()).default([]),
});

/** Replace a member's set of granted trips. */
export const PUT = ownerRoute(putSchema, async ({ admin, input, params }) => {
  const id = params.id;
  await admin.from("trip_members").delete().eq("user_id", id);
  if (input.tripIds.length > 0) {
    const { error } = await admin
      .from("trip_members")
      .insert(input.tripIds.map((trip_id) => ({ trip_id, user_id: id })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return { ok: true };
});

/** Remove a collaborator entirely (deletes their account; grants cascade). */
export const DELETE = ownerRoute(z.unknown(), async ({ admin, self, params }) => {
  const id = params.id;
  if (id === self) {
    return NextResponse.json({ error: "cannot remove yourself" }, { status: 400 });
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
  return { ok: true };
});
