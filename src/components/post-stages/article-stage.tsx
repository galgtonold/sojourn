"use client";
import { useMemo, useRef } from "react";
import { AlertTriangle, HelpCircle, ListChecks } from "lucide-react";
import type { Photo } from "@/lib/types";
import type { EditorInteraction } from "@/lib/story-editor";
import { parseDirectives, validateBody } from "@/lib/interactions-parse";
import {
  InlineEditor,
  type InlineEditorHandle,
} from "@/components/inline-editor";
import { InsertPalette } from "@/components/insert-palette";
import { FormattingHelp } from "@/components/formatting-help";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

const input =
  "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

export function ArticleStage({
  title,
  body,
  photos,
  interactions,
  photoIds,
  interactionIds,
  onTitleChange,
  onBodyChange,
  onPhotoClick,
  onInteractionClick,
}: {
  title: string;
  body: string;
  photos: Photo[];
  interactions: EditorInteraction[];
  photoIds: string[];
  interactionIds: string[];
  onTitleChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  // Clicking a photo chip in the editor scrolls to the matching gallery image.
  onPhotoClick?: (photoId: string) => void;
  // Clicking a poll/quiz chip opens that interaction for editing.
  onInteractionClick?: (interactionId: string) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const editorRef = useRef<InlineEditorHandle>(null);
  const { issues, pendingCount } = useMemo(() => {
    const ctx = {
      photoIds,
      photoCount: photoIds.length,
      interactionIds,
      interactionCount: interactionIds.length,
    };
    const pending = parseDirectives(body).filter((d) => d.problems.length === 0).length;
    return { issues: validateBody(body, ctx), pendingCount: pending };
  }, [body, photoIds, interactionIds]);

  return (
    <div className="space-y-4">
      <input
        className={`${input} font-display text-lg`}
        placeholder={t("admin.editor.title")}
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
      />
      <div className="space-y-2">
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              confirm({
                title: t("admin.editor.helpLabel"),
                message: <FormattingHelp />,
                notice: true,
              })
            }
            className="inline-flex items-center gap-1 text-xs text-sand-100/50 transition hover:text-sand-100"
          >
            <HelpCircle className="size-3.5" /> {t("admin.editor.helpLabel")}
          </button>
        </div>
        <InsertPalette
          photos={photos}
          interactions={interactions}
          body={body}
          onInsertPhoto={(id) => editorRef.current?.insertToken(`[photo:${id}]`)}
          onInsertInteraction={(id) => editorRef.current?.insertToken(`[ask:${id}]`)}
        />
        <InlineEditor
          ref={editorRef}
          body={body}
          onChange={onBodyChange}
          photos={photos}
          interactions={interactions}
          placeholder={t("admin.editor.body")}
          onPhotoClick={onPhotoClick}
          onInteractionClick={onInteractionClick}
        />
      </div>
      {pendingCount > 0 && (
        <p className="flex items-center gap-2 text-xs text-ember-300">
          <ListChecks className="size-3.5" />
          {t("admin.litter.pending", { n: pendingCount })}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {issues.map((iss, i) => (
            <li key={i} className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 shrink-0" />
              {iss.type === "unknown-photo"
                ? t("admin.litter.brokenPhoto", { ref: iss.ref })
                : iss.type === "unknown-ask"
                  ? t("admin.litter.brokenAsk", { ref: iss.ref })
                  : t("admin.litter.badBlock", { kind: iss.kind, problems: iss.problems.join(", ") })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
