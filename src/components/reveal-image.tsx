"use client";
import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn, optimizedSrc } from "@/lib/utils";

/**
 * A next/image that fades up from a blurred preview of itself once loaded.
 *
 * For `fill` covers backed by a remote URL we paint a tiny, heavily-blurred
 * copy of the same image underneath — it arrives almost instantly, so the cover
 * fades up from a soft version of itself instead of flashing black while the
 * full-resolution file downloads. Elsewhere we fall back to a shimmering
 * skeleton. Either way the placeholder leaves the image's own transforms
 * (e.g. a hover zoom) untouched.
 */
export function RevealImage({
  imgClassName,
  overlay,
  ...img
}: Omit<ImageProps, "className"> & {
  imgClassName?: string;
  overlay?: ReactNode;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // If the image was already cached and finished before hydration, onLoad
  // won't fire — detect that on mount so the placeholder doesn't stay stuck.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  const lowSrc =
    img.fill && typeof img.src === "string"
      ? optimizedSrc(img.src, 64, 30)
      : null;

  return (
    <>
      {lowSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={lowSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full scale-105 object-cover blur-2xl"
        />
      )}
      <Image
        {...img}
        ref={ref}
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover",
          // Fade the full image in over the blurred preview.
          lowSrc && "transition-opacity duration-700 ease-out",
          lowSrc && !loaded && "opacity-0",
          imgClassName,
        )}
      />
      {overlay}
      {!lowSrc && (
        <div
          aria-hidden
          className={cn(
            "skeleton pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out",
            loaded && "opacity-0",
          )}
        />
      )}
    </>
  );
}
