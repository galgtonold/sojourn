"use client";
import { useMemo } from "react";
import { Check, ImagePlus } from "lucide-react";
import type { Photo } from "@/lib/types";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { referencedPhotoIds } from "@/lib/rich";
import { useT } from "@/components/i18n";

/**
 * A visual photo picker for the editor: click a thumbnail to drop its
 * [photo:<id>] tag at the caret, so authors never type or read a raw id.
 * Photos already placed in the body are badged.
 */
export function PhotoPalette({
  photos,
  body,
  onInsert,
}: {
  photos: Photo[];
  body: string;
  onInsert: (tag: string) => void;
}) {
  const t = useT();
  const used = useMemo(() => referencedPhotoIds(body, photos), [body, photos]);
  if (photos.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-sand-100/60">
        <ImagePlus className="size-3.5 text-ember-400" />
        {t("admin.editor.palette")}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => {
          const isUsed = used.has(p.id);
          const blur = blurhashToDataURL(p.blurhash);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onInsert(`[photo:${p.id}]`)}
              title={p.caption ?? ""}
              className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 transition hover:ring-ember-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={optimizedSrc(p.url ?? "", 192, 60)}
                alt=""
                loading="lazy"
                className="size-full object-cover"
                style={
                  blur
                    ? { backgroundImage: `url(${blur})`, backgroundSize: "cover" }
                    : undefined
                }
              />
              <span className="absolute left-1 top-1 grid size-4 place-items-center rounded bg-ink-950/70 text-[10px] font-bold text-sand-50">
                {i + 1}
              </span>
              {isUsed && (
                <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-ember-500 text-ink-950">
                  <Check className="size-3" />
                </span>
              )}
              {p.caption && (
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink-950/90 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-sand-100/90">
                  {p.caption}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
