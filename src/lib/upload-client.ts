"use client";
// Uploads an image to the public `photos` Supabase Storage bucket from the
// authenticated admin's browser session (RLS allows authenticated writes).
import { getBrowserSupabase } from "@/lib/supabase/client";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function uploadImage(
  file: File,
  folder = "uploads",
): Promise<{ url: string; path: string }> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Storage isn’t available (demo mode).");
  if (!file.type.startsWith("image/")) throw new Error("That isn’t an image.");
  if (file.size > MAX_BYTES) throw new Error("Image is larger than 15 MB.");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("photos").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return { url: data.publicUrl, path };
}
