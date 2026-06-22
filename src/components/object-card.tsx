"use client";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  X,
} from "lucide-react";
import type { EditorBlock } from "@/lib/story-editor";
import { PollPreview } from "@/components/poll-preview";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";

const btn =
  "rounded p-1 text-sand-100/60 transition hover:bg-white/10 hover:text-sand-100 disabled:pointer-events-none disabled:opacity-30";

/** One non-prose block rendered as a real inline card with a move/delete/copy
 *  toolbar. Read-only: editing a placed poll happens by removing and re-adding. */
export function ObjectCard({
  block,
  canUp,
  canDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  onCopy,
}: {
  // ObjectCard is only ever rendered for non-prose blocks (the orchestrator
  // renders prose as a textarea), so exclude "prose" — this lets the final
  // render branch narrow to "pending" and read block.spec.
  block: Exclude<EditorBlock, { kind: "prose" }>;
  canUp: boolean;
  canDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const t = useT();

  const toolbar = (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        className={btn}
        disabled={!canUp}
        aria-label={t("admin.editor.moveEarlier")}
        onClick={onMoveUp}
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        disabled={!canDown}
        aria-label={t("admin.editor.moveLater")}
        onClick={onMoveDown}
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t("admin.editor.copyMarkdown")}
        onClick={onCopy}
      >
        <Copy className="size-4" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t("admin.editor.removeObject")}
        onClick={onDelete}
      >
        <X className="size-4" />
      </button>
    </div>
  );

  if (block.kind === "broken") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          {block.refType === "photo"
            ? t("admin.litter.brokenPhoto", { ref: block.ref })
            : t("admin.litter.brokenAsk", { ref: block.ref })}
        </span>
        {toolbar}
      </div>
    );
  }

  const label =
    block.kind === "photo"
      ? null
      : block.kind === "interaction"
        ? block.interaction.kind === "quiz"
          ? t("admin.editor.quizLabel")
          : t("admin.editor.pollLabel")
        : block.spec.kind === "quiz"
          ? t("admin.editor.quizLabel")
          : t("admin.editor.pollLabel");

  return (
    <div className="rounded-2xl border border-white/10 bg-ink-900/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="text-xs uppercase tracking-wide text-sand-100/40">
          {label}
        </span>
        {toolbar}
      </div>
      <div className="p-3">
        {block.kind === "photo" ? (
          <figure className="space-y-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={optimizedSrc(block.photo.url ?? "", 640, 70)}
              alt={block.photo.caption ?? ""}
              className="w-full rounded-lg object-cover"
            />
            {block.photo.caption && (
              <figcaption className="text-sm text-sand-100/60">
                {block.photo.caption}
              </figcaption>
            )}
          </figure>
        ) : block.kind === "interaction" ? (
          <PollPreview
            kind={block.interaction.kind}
            question={block.interaction.question}
            options={block.interaction.options}
            correctIndex={block.interaction.correct_index}
          />
        ) : (
          <PollPreview
            kind={block.spec.kind}
            question={block.spec.question}
            options={block.spec.options}
            correctIndex={block.spec.correctIndex}
          />
        )}
      </div>
    </div>
  );
}
