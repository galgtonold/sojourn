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
  width = null,
  height = null,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt?: string;
  blurhash?: string | null;
  caption?: string | null;
  /** Pass them when the caller has them: they let the slide take its final
   *  shape before the image loads, instead of the caption jumping onto the
   *  photo once it does. Omitted, the slide measures on load as it always did. */
  width?: number | null;
  height?: number | null;
  onClose: () => void;
}) {
  return (
    <PhotoViewer
      open={open && !!src}
      items={
        src ? [{ url: src, alt, caption, blurhash, width, height, mediaType: "image" }] : []
      }
      index={0}
      onIndexChange={() => {}}
      onClose={onClose}
    />
  );
}
