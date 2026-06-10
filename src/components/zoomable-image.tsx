"use client";
import { useState } from "react";
import { optimizedSrc } from "@/lib/utils";
import { ImageLightbox } from "@/components/image-lightbox";

/**
 * An inline article image that opens into the shared full-screen
 * {@link ImageLightbox} on click (rotation, progressive load, animated open).
 */
export function ZoomableImage({
  src,
  alt = "",
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={optimizedSrc(src, 1600, 80)}
        alt={alt}
        loading="lazy"
        onClick={() => setOpen(true)}
        className={`${className ?? ""} cursor-zoom-in`.trim()}
      />
      <ImageLightbox
        open={open}
        src={src}
        alt={alt}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
