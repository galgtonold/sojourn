"use client";
import { useEffect, useRef, useState } from "react";
import { blurhashToDataURL } from "@/lib/blurhash";
import { cn } from "@/lib/utils";

/**
 * A plain <img> that paints an instant blurhash placeholder underneath and
 * fades the real image in over it — for spots where next/image isn't a fit
 * (a raw src sized by its container). The parent must be `relative`.
 */
export function BlurImg({
  src,
  blurhash,
  alt = "",
  className,
}: {
  src: string;
  blurhash?: string | null;
  alt?: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // If it was cached and finished before hydration, onLoad won't fire.
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, []);

  const placeholder = blurhashToDataURL(blurhash, 24, 24);

  return (
    <>
      {placeholder && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={placeholder}
          alt=""
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 size-full scale-105 object-cover blur-md transition-opacity duration-500",
            loaded && "opacity-0",
          )}
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={ref}
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        className={cn(
          "relative size-full object-cover",
          placeholder && "transition-opacity duration-500",
          placeholder && !loaded && "opacity-0",
          className,
        )}
      />
    </>
  );
}
