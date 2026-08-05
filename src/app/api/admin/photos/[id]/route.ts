import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { removePhotoObjects } from "@/lib/photo-objects";

// Deleting a photograph, both halves of it.
//
// This used to happen in the browser: delete the row through the session
// client, then remove the object through the same client, and check neither.
// 0043 narrowed the bucket's delete policy to `is_owner()`, so for every
// collaborator the second half silently failed — the row went, the file stayed
// at its public URL, and the UI reported success.
//
// The row delete goes through the RLS client, so the `scoped write photos`
// policy decides who may do it and a row coming back is the proof. Only then
// does the service role remove the object, which is the only client the bucket
// policy allows to.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Read the path first: after the delete there is no row to read it from.
  const { data: photo } = await supabase
    .from("photos")
    .select("storage_path")
    .eq("id", id)
    .maybeSingle();

  const { data: deleted, error } = await supabase
    .from("photos")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
  if (!deleted?.length) {
    // RLS refused, or it was already gone. Either way nothing was removed, so
    // do not go on to delete the object.
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { failed } = await removePhotoObjects([
    (photo as { storage_path?: string | null } | null)?.storage_path,
  ]);
  // The row is gone either way — reporting a failure now would describe a
  // delete that did happen as one that did not. The caller is told so it can
  // say something useful, and the log carries the detail.
  return NextResponse.json({ ok: true, objectRemoved: !failed });
}
