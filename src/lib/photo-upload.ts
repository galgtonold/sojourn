// Pure upload policy, lifted out of PhotoManager.addFiles: which files are
// acceptable, and how an UploadResult maps to a `photos` insert row. The
// component keeps the actual await-upload + setState orchestration and calls
// these — so the decisions most likely to regress become testable.
import { mediaKind } from "@/lib/media-kind";
import type { UploadResult } from "@/lib/upload-client";

export const MAX_VIDEO_BYTES = 52428800; // 50 MB

export type UploadCheck =
  | { ok: true; kind: "image" | "video" }
  | { ok: false };

/** Whether a selected file is an acceptable upload: a known image/video kind,
 *  and (for video) within the size cap. */
export function validateUploadFile(file: {
  type: string;
  size: number;
}): UploadCheck {
  const kind = mediaKind(file.type);
  if (kind === null) return { ok: false };
  if (kind === "video" && file.size > MAX_VIDEO_BYTES) return { ok: false };
  return { ok: true, kind };
}

/** Map an UploadResult to a `photos` insert row at the given sort order. */
export function uploadResultToRow(
  res: UploadResult,
  postId: string,
  order: number,
) {
  return {
    post_id: postId,
    url: res.url,
    storage_path: res.path,
    media_type: res.mediaType,
    poster_url: res.posterUrl,
    poster_path: res.posterPath,
    lat: res.lat,
    lng: res.lng,
    taken_at: res.takenAt,
    taken_at_offset_min: res.takenOffsetMin,
    width: res.width,
    height: res.height,
    blurhash: res.blurhash,
    sort_order: order,
  };
}
