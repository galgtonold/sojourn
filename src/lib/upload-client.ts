"use client";
// Uploads an image to the public `photos` Supabase Storage bucket from the
// authenticated admin's browser session (RLS allows authenticated writes).
//
// Before upload we downscale + re-encode to WebP so we never store giant
// originals (smaller storage, faster optimizer source). Falls back to the
// untouched file if the browser can't process it (e.g. HEIC).
import { encode } from "blurhash";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { parseExifDateTime } from "@/lib/exif-datetime";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard cap on the original
const MAX_VIDEO_BYTES = 52428800; // 50 MB

export type UploadResult = {
  url: string;
  path: string;
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
  takenOffsetMin: number | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
  mediaType: "image" | "video";
  posterUrl: string | null;
  posterPath: string | null;
};

// Pull GPS + capture time from the ORIGINAL file (downscaling to WebP strips
// EXIF, so this must run first). Best-effort — returns nulls on any failure.
async function readExif(
  file: File,
): Promise<{
  lat: number | null;
  lng: number | null;
  takenAt: string | null;
  takenOffsetMin: number | null;
}> {
  let lat: number | null = null;
  let lng: number | null = null;
  let takenAt: string | null = null;
  let takenOffsetMin: number | null = null;
  // exifr is only needed once files are chosen, so it must not sit in the
  // editor's first load — load it here, not at module scope.
  const exifr = (await import("exifr")).default;
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
    // Read raw (un-revived) strings so capture time is independent of the
    // browser's timezone; the parse (label-as-UTC + offset) lives in
    // parseExifDateTime so it's testable.
    const meta = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "OffsetTimeOriginal"],
      reviveValues: false,
    });
    ({ takenAt, takenOffsetMin } = parseExifDateTime(
      meta?.DateTimeOriginal,
      meta?.OffsetTimeOriginal,
    ));
  } catch {
    /* no date */
  }
  return { lat, lng, takenAt, takenOffsetMin };
}

// Capture pixel dimensions + a blurhash placeholder by decoding the image
// once. Best-effort: returns nulls on any failure (e.g. HEIC the browser can't
// decode), so the photo still uploads — just without a blur placeholder. The
// blurhash columns already exist on `photos`; this is what finally fills them.
async function readImageMeta(
  file: File,
): Promise<{ width: number | null; height: number | null; blurhash: string | null }> {
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const width = bitmap.width;
    const height = bitmap.height;

    let blurhash: string | null = null;
    try {
      // Encode from a tiny canvas (≤32px longest edge) — cheap, yet faithful.
      const maxEdge = 32;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        blurhash = encode(data, w, h, 4, 3);
      }
    } catch {
      /* blurhash is optional */
    }
    bitmap.close?.();
    return { width, height, blurhash };
  } catch {
    return { width: null, height: null, blurhash: null };
  }
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
  const meta = await readImageMeta(file);

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
  return {
    url: data.publicUrl,
    path,
    mediaType: "image",
    posterUrl: null,
    posterPath: null,
    ...exif,
    ...meta,
  };
}

// Grab a poster frame + dimensions + blurhash from a video's first frame. All
// browser-only and best-effort: any failure returns nulls and the video still
// uploads without a poster.
async function readVideoPoster(file: File): Promise<{
  poster: Blob | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
}> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("video timeout")), 8000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onloadedmetadata = () => {
        // Nudge off frame 0 — some encoders start on a black frame.
        try {
          video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
        } catch {
          done();
        }
      };
      video.onseeked = done;
      video.onloadeddata = done;
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("video decode failed"));
      };
    });

    const width = video.videoWidth || null;
    const height = video.videoHeight || null;
    if (!width || !height) return { poster: null, width, height, blurhash: null };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { poster: null, width, height, blurhash: null };
    ctx.drawImage(video, 0, 0, width, height);
    const poster = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/webp", 0.8),
    );

    let blurhash: string | null = null;
    try {
      const maxEdge = 32;
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      const c2 = document.createElement("canvas");
      c2.width = w;
      c2.height = h;
      const x2 = c2.getContext("2d");
      if (x2) {
        x2.drawImage(video, 0, 0, w, h);
        blurhash = encode(x2.getImageData(0, 0, w, h).data, w, h, 4, 3);
      }
    } catch {
      /* blurhash is optional */
    }
    return { poster, width, height, blurhash };
  } catch {
    return { poster: null, width: null, height: null, blurhash: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Upload an MP4/WebM video as-is (no re-encode) plus a generated poster image.
export async function uploadVideo(
  file: File,
  folder = "uploads",
): Promise<UploadResult> {
  const supabase = getBrowserSupabase();
  if (!supabase) throw new Error("Storage isn’t available (demo mode).");
  if (file.size > MAX_VIDEO_BYTES) throw new Error("Video is larger than 50 MB.");

  const { poster, width, height, blurhash } = await readVideoPoster(file);

  const base = `${folder}/${crypto.randomUUID()}`;
  const ext = file.type === "video/webm" ? "webm" : "mp4";
  const path = `${base}.${ext}`;
  const { error } = await supabase.storage.from("photos").upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("photos").getPublicUrl(path);

  let posterUrl: string | null = null;
  let posterPath: string | null = null;
  if (poster) {
    const pPath = `${base}-poster.webp`;
    const up = await supabase.storage.from("photos").upload(pPath, poster, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
    if (!up.error) {
      posterPath = pPath;
      posterUrl = supabase.storage.from("photos").getPublicUrl(pPath).data.publicUrl;
    }
  }

  return {
    url: data.publicUrl,
    path,
    mediaType: "video",
    posterUrl,
    posterPath,
    lat: null,
    lng: null,
    takenAt: null,
    takenOffsetMin: null,
    width,
    height,
    blurhash,
  };
}
