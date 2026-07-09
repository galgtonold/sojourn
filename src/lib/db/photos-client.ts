// Client-side photo mutations for the editor — the browser counterpart to the
// server-only db/photos.ts. Managers call these instead of building
// getBrowserSupabase().from("photos") chains inline. Throws on error so the
// caller can roll back its optimistic UI.
import { getBrowserSupabase } from "@/lib/supabase/client";

export async function updatePhotoFields(
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const supabase = getBrowserSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("photos").update(fields).eq("id", id);
  if (error) throw new Error(error.message);
}
