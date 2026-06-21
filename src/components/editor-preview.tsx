"use client";
import { useMemo } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import { parseBody } from "@/lib/rich";
import { optimizedSrc } from "@/lib/utils";
import type { Photo } from "@/lib/types";
import { useT } from "@/components/i18n";

type PhotoToken = { token: string; id: string; index: number };

const PHOTO_TOKEN_RE = /\[photo:([^\]\s]+)\]/g;

function photoTokens(body: string): PhotoToken[] {
  return [...body.matchAll(PHOTO_TOKEN_RE)].map((m) => ({
    token: m[0],
    id: m[1],
    index: m.index ?? 0,
  }));
}

// Remove a token and collapse the blank lines it leaves behind.
function removeToken(body: string, tok: PhotoToken): string {
  return (
    body.slice(0, tok.index) + body.slice(tok.index + tok.token.length)
  ).replace(/\n{3,}/g, "\n\n");
}

// Swap the ids of two tokens in place (a before b), so the two images trade
// slots while the surrounding prose stays put. Replace the later one first so
// the earlier one's offset stays valid.
function swapTokens(body: string, a: PhotoToken, b: PhotoToken): string {
  let out =
    body.slice(0, b.index) + `[photo:${a.id}]` + body.slice(b.index + b.token.length);
  out = out.slice(0, a.index) + `[photo:${b.id}]` + out.slice(a.index + a.token.length);
  return out;
}

/**
 * A "what your tags map to" view of the body: prose as muted text, each
 * [photo:<id>] rendered as a thumbnail + caption chip, interactions as a
 * labelled chip, dangling references flagged. When `onBodyChange` is given, the
 * photo chips become actionable — delete an image or swap it with its neighbour
 * straight from here, so you don't have to hunt the raw token in the markdown.
 */
export function EditorPreview({
  body,
  photos,
  onBodyChange,
}: {
  body: string;
  photos: Photo[];
  onBodyChange?: (next: string) => void;
}) {
  const t = useT();
  const tokens = useMemo(() => photoTokens(body), [body]);
  if (!body.trim()) return null;
  const blocks = parseBody(body, photos, [], { showIssues: true });
  const editable = Boolean(onBodyChange);
  // Photo blocks render in document order, so the nth photo block maps to the
  // nth token; a running counter keeps them aligned without parsing offsets.
  let photoSeen = -1;

  const btn =
    "rounded p-0.5 text-sand-100/60 transition hover:bg-white/10 hover:text-sand-100 disabled:pointer-events-none disabled:opacity-30";

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
          if (b.kind === "photo") {
            photoSeen += 1;
            const ord = photoSeen;
            const tok = tokens[ord];
            return (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-lg border border-ember-400/30 bg-ember-500/10 py-0.5 pl-0.5 pr-1.5 align-middle"
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
                {editable && tok && (
                  <span className="ml-0.5 flex items-center gap-0.5">
                    <button
                      type="button"
                      className={btn}
                      disabled={ord === 0}
                      aria-label={t("admin.editor.moveUp")}
                      onClick={() =>
                        onBodyChange!(swapTokens(body, tokens[ord - 1], tok))
                      }
                    >
                      <ChevronUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={ord === tokens.length - 1}
                      aria-label={t("admin.editor.moveDown")}
                      onClick={() =>
                        onBodyChange!(swapTokens(body, tok, tokens[ord + 1]))
                      }
                    >
                      <ChevronDown className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      className={btn}
                      aria-label={t("admin.editor.removePhoto")}
                      onClick={() => onBodyChange!(removeToken(body, tok))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                )}
              </span>
            );
          }
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
