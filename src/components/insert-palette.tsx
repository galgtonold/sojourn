"use client";
import { useMemo } from "react";
import { Check, ImagePlus, ListChecks, MessageCircleQuestion } from "lucide-react";
import type { Photo } from "@/lib/types";
import type { EditorInteraction } from "@/lib/story-editor";
import { optimizedSrc } from "@/lib/utils";
import { blurhashToDataURL } from "@/lib/blurhash";
import { referencedPhotoIds } from "@/lib/rich";
import { useT } from "@/components/i18n";

/** The insert bar: a horizontal strip of the post's defined media — its photos
 *  and its defined polls/quizzes. Clicking drops a reference at the editor's
 *  caret: [photo:<id>] or [ask:<id>]. Already-placed items are badged. */
export function InsertPalette({
  photos,
  interactions,
  body,
  onInsertPhoto,
  onInsertInteraction,
}: {
  photos: Photo[];
  interactions: EditorInteraction[];
  body: string;
  onInsertPhoto: (id: string) => void;
  onInsertInteraction: (id: string) => void;
}) {
  const t = useT();
  const usedPhotos = useMemo(() => referencedPhotoIds(body, photos), [body, photos]);
  const usedAsk = useMemo(
    () => new Set([...body.matchAll(/\[ask:([^\]\s]+)\]/g)].map((m) => m[1])),
    [body],
  );

  if (photos.length === 0 && interactions.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs text-sand-100/60">
        <ImagePlus className="size-3.5 text-ember-400" />
        {t("admin.editor.insertBar")}
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => {
          const isUsed = usedPhotos.has(p.id);
          const blur = blurhashToDataURL(p.blurhash);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onInsertPhoto(p.id)}
              title={p.caption ?? ""}
              aria-label={t("admin.editor.insertPhoto")}
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

        {interactions.map((it) => {
          const isUsed = usedAsk.has(it.id);
          const Icon = it.kind === "quiz" ? ListChecks : MessageCircleQuestion;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onInsertInteraction(it.id)}
              title={it.question}
              aria-label={t("admin.editor.insertInteraction")}
              className="relative flex h-16 w-40 shrink-0 flex-col justify-between rounded-lg border border-white/10 p-2 text-left transition hover:border-ember-400"
            >
              <Icon className="size-4 shrink-0 text-sage-400" />
              <span className="line-clamp-2 text-[11px] leading-tight text-sand-100/80">
                {it.question}
              </span>
              {isUsed && (
                <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-ember-500 text-ink-950">
                  <Check className="size-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
