"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Photo } from "@/lib/types";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { useT } from "@/components/i18n";

export function Gallery({ photos }: { photos: Photo[] }) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);

  const close = useCallback(() => setOpen(null), []);
  const next = useCallback(
    () => setOpen((i) => (i === null ? i : (i + 1) % photos.length)),
    [photos.length],
  );
  const prev = useCallback(
    () =>
      setOpen((i) =>
        i === null ? i : (i - 1 + photos.length) % photos.length,
      ),
    [photos.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, next, prev]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((photo, i) => {
          const blur = blurhashToDataURL(photo.blurhash);
          return (
            <button
              key={photo.id}
              onClick={() => setOpen(i)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-ink-800"
            >
              {photo.url && (
                <Image
                  src={photo.url}
                  alt={photo.alt ?? photo.caption ?? ""}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  placeholder={blur ? "blur" : "empty"}
                  blurDataURL={blur ?? undefined}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              )}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {open !== null && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          >
            <button
              onClick={close}
              aria-label={t("common.close")}
              className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <X className="size-5" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  aria-label={t("common.previous")}
                  onClick={(e) => {
                    e.stopPropagation();
                    prev();
                  }}
                  className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronLeft className="size-6" />
                </button>
                <button
                  aria-label={t("common.next")}
                  onClick={(e) => {
                    e.stopPropagation();
                    next();
                  }}
                  className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <ChevronRight className="size-6" />
                </button>
              </>
            )}

            <motion.figure
              key={photos[open].id}
              className="relative mx-auto max-h-[85dvh] w-[92vw] max-w-4xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={(e) => e.stopPropagation()}
            >
              {photos[open].url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={optimizedSrc(photos[open].url!, 2048, 80)}
                  alt={photos[open].alt ?? photos[open].caption ?? ""}
                  className="mx-auto max-h-[80dvh] w-auto rounded-2xl object-contain"
                />
              )}
              {photos[open].caption && (
                <figcaption className="mt-3 text-center text-sm text-sand-100/70">
                  {photos[open].caption}
                </figcaption>
              )}
            </motion.figure>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
