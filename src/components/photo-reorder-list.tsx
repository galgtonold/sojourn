"use client";
import Image from "next/image";
import { Reorder } from "framer-motion";
import { Check, GripVertical } from "lucide-react";
import { useT } from "@/components/i18n";
import type { ManagedPhoto } from "@/components/photo-manager";

/**
 * Drag-to-reorder view for the gallery, split out of PhotoManager so the
 * framer-motion Reorder namespace can be dynamically imported as a unit —
 * see the WHY comment at that call site.
 */
export function PhotoReorderList({
  photos,
  onReorder,
  onDone,
}: {
  photos: ManagedPhoto[];
  onReorder: (photos: ManagedPhoto[]) => void;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <p className="text-sm text-sand-100/60">
        {t("admin.gallery.reorderHint")}
      </p>
      <Reorder.Group
        axis="y"
        values={photos}
        onReorder={onReorder}
        className="space-y-2"
      >
        {photos.map((photo) => {
          const thumb =
            photo.media_type === "video" ? photo.poster_url : photo.url;
          return (
            <Reorder.Item
              key={photo.id}
              value={photo}
              className="flex touch-none cursor-grab items-center gap-3 rounded-xl border border-white/10 bg-ink-800 p-2 active:cursor-grabbing"
            >
              <GripVertical className="size-4 shrink-0 text-sand-100/40" />
              <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-ink-900">
                {thumb && (
                  <Image
                    src={thumb}
                    alt={photo.caption ?? ""}
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
              <span className="line-clamp-2 flex-1 text-xs text-sand-100/70">
                {photo.caption?.trim() || t("admin.gallery.caption")}
              </span>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      <button
        type="button"
        onClick={onDone}
        className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
      >
        <Check className="size-4" /> {t("admin.gallery.reorderDone")}
      </button>
    </div>
  );
}
