"use client";
import Image, { type ImageProps } from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A next/image that fades in from a shimmering placeholder once loaded.
 * The placeholder sits on top of the image (and any `overlay`) and fades out,
 * so the image keeps its own transforms (e.g. hover zoom) untouched.
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
  // won't fire — detect that on mount so the shimmer doesn't stay stuck.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  return (
    <>
      <Image
        {...img}
        ref={ref}
        onLoad={() => setLoaded(true)}
        className={cn("object-cover", imgClassName)}
      />
      {overlay}
      <div
        aria-hidden
        className={cn(
          "skeleton pointer-events-none absolute inset-0 transition-opacity duration-700 ease-out",
          loaded && "opacity-0",
        )}
      />
    </>
  );
}
