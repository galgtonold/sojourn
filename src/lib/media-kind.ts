// Classify an upload by MIME type. Images are any image/*; videos are limited to
// the web-playable formats (mp4/webm) — iPhone HEVC .mov (video/quicktime) is
// deliberately rejected because it won't play in Chrome/Firefox. Anything else
// is unsupported.
export function mediaKind(mime: string): "image" | "video" | null {
  if (mime.startsWith("image/")) return "image";
  if (mime === "video/mp4" || mime === "video/webm") return "video";
  return null;
}
