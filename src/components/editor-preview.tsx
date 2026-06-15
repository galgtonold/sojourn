"use client";
import { AlertTriangle, MessageCircleQuestion } from "lucide-react";
import { parseBody } from "@/lib/rich";
import { optimizedSrc } from "@/lib/utils";
import type { Photo } from "@/lib/types";
import { useT } from "@/components/i18n";

/**
 * A read-only "what your tags map to" view of the body: prose as muted text,
 * each [photo:<id>] rendered as a thumbnail + caption chip, interactions as a
 * labelled chip, and any dangling reference flagged — so the photo mapping is
 * legible without ever reading a raw id.
 */
export function EditorPreview({
  body,
  photos,
}: {
  body: string;
  photos: Photo[];
}) {
  const t = useT();
  if (!body.trim()) return null;
  const blocks = parseBody(body, photos, [], { showIssues: true });

  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/40 p-3">
      <p className="mb-2 text-xs text-sand-100/50">{t("admin.editor.preview")}</p>
      <div className="flex max-h-64 flex-wrap items-center gap-1.5 overflow-y-auto text-sm leading-relaxed">
        {blocks.map((b, i) => {
          if (b.kind === "md")
            return (
              <span key={i} className="whitespace-pre-wrap text-sand-100/45">
                {b.text.trim()}
              </span>
            );
          if (b.kind === "photo")
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ember-400/30 bg-ember-500/10 py-0.5 pl-0.5 pr-2 align-middle"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedSrc(b.photo.url ?? "", 64, 60)}
                  alt=""
                  className="size-8 rounded object-cover"
                />
                <span className="max-w-[12rem] truncate text-xs text-sand-100/85">
                  {b.photo.caption ?? t("admin.editor.photoChip")}
                </span>
              </span>
            );
          if (b.kind === "broken" && b.refType === "photo")
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-300"
              >
                <AlertTriangle className="size-3" />
                {t("admin.litter.brokenPhoto", { ref: b.ref })}
              </span>
            );
          // interactions / inline poll-quiz blocks / dangling asks → neutral chip
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-lg border border-sage-400/30 bg-sage-500/10 px-2 py-0.5 text-xs text-sage-400"
            >
              <MessageCircleQuestion className="size-3" />
              {t("admin.editor.interactionChip")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
