"use client";
import { PhotoViewer } from "@/components/photo-viewer";

/**
 * A single-image convenience wrapper over {@link PhotoViewer} — used where there
 * is no collection to page through (the /photos explorer and the journey map).
 * All the viewer's visuals (blurhash backdrop, rotation, progressive load,
 * Back-to-close) come from PhotoViewer; with one item it simply shows no prev/next.
 */
export function ImageLightbox({
  open,
  src,
  alt = "",
  blurhash = null,
  caption = null,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt?: string;
  blurhash?: string | null;
  caption?: string | null;
  onClose: () => void;
}) {
  return (
    <PhotoViewer
      open={open && !!src}
      items={src ? [{ url: src, alt, caption, blurhash, mediaType: "image" }] : []}
      index={0}
      onIndexChange={() => {}}
      onClose={onClose}
    />
  );
}
