"use client";
import { useState } from "react";
import { optimizedSrc } from "@/lib/utils";
import { ImageLightbox } from "@/components/image-lightbox";
import { usePhotoViewer } from "@/components/photo-viewer";

/**
 * An inline article image. Inside an article (a {@link PhotoViewerProvider} is
 * present and the photo has an id) a click opens the shared viewer positioned on
 * this photo, so the reader can page through every photo in the article. Elsewhere
 * — a generic markdown image, or the story map — it falls back to a single-image
 * {@link ImageLightbox}.
 */
export function ZoomableImage({
  src,
  alt = "",
  blurhash = null,
  className,
  photoId,
}: {
  src: string;
  alt?: string;
  blurhash?: string | null;
  className?: string;
  photoId?: string;
}) {
  const viewer = usePhotoViewer();
  const [open, setOpen] = useState(false);
  const shared = Boolean(viewer && photoId);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(src, 1600, 80)}
        alt={alt}
        loading="lazy"
        onClick={() => (shared ? viewer!.open(photoId!) : setOpen(true))}
        className={`${className ?? ""} cursor-zoom-in`.trim()}
      />
      {!shared && (
        <ImageLightbox
          open={open}
          src={src}
          alt={alt}
          blurhash={blurhash}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
