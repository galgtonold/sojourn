"use client";
// Uploads an image to the public `photos` Supabase Storage bucket from the
// authenticated admin's browser session (RLS allows authenticated writes).
//
// Before upload we downscale + re-encode to WebP so we never store giant
// originals (smaller storage, faster optimizer source). Falls back to the
// untouched file if the browser can't process it (e.g. HEIC).
import exifr from "exifr";
import { getBrowserSupabase } from "@/lib/supabase/client";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard cap on the original

export type UploadResult = {
  url: string;
  path: string;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
};

// Pull GPS + capture time from the ORIGINAL file (downscaling to WebP strips
// EXIF, so this must run first). Best-effort — returns nulls on any failure.
async function readExif(
  file: File,
): Promise<{ lat: number | null; lng: number | null; takenAt: string | null }> {
  let lat: number | null = null;
  let lng: number | null = null;
  let takenAt: string | null = null;
  try {
    const gps = await exifr.gps(file);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      lat = gps.latitude;
      lng = gps.longitude;
    }
  } catch {
    /* no gps */
  }
  try {
    const meta = await exifr.parse(file, ["DateTimeOriginal"]);
    if (meta?.DateTimeOriginal) {
      const d = new Date(meta.DateTimeOriginal);
      if (!Number.isNaN(d.getTime())) takenAt = d.toISOString();
    }
  } catch {
    /* no date */
  }
  return { lat, lng, takenAt };
}

async function downscale(
  file: File,
  maxDim: number,
  quality: number,
): Promise<{ blob: Blob; ext: string; type: string }> {
  // Don't touch vector/animated formats.
  if (file.type === "image/svg+xml" || file.type === "image/gif") {
    return { blob: file, ext: file.name.split(".").pop() || "img", type: file.type };
  }
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, maxDim / longest);
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) throw new Error("encode failed");

    // If WebP somehow came out larger than the original, keep the original.
    if (blob.size >= file.size && scale === 1) {
      return { blob: file, ext: file.name.split(".").pop() || "img", type: file.type };
    }
    return { blob, ext: "webp", type: "image/webp" };
  } catch {
    // HEIC or unsupported decode — upload the original untouched.
    return { blob: file, ext: file.name.split(".").pop() || "img", type: file.type };
  }
}

export async function uploadImage(
  file: File,
  folder = "uploads",
  opts: { maxDim?: number; quality?: number } = {},
): Promise<UploadResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Storage isn’t available (demo mode).");
  if (!file.type.startsWith("image/")) throw new Error("That isn’t an image.");
  if (file.size > MAX_BYTES) throw new Error("Image is larger than 25 MB.");

  const exif = await readExif(file);

  const { blob, ext, type } = await downscale(
    file,
    opts.maxDim ?? 2880,
    opts.quality ?? 0.82,
  );

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, blob, {
    cacheControl: "31536000",
    contentType: type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return { url: data.publicUrl, path, ...exif };
}
