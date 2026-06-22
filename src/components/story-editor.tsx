"use client";
import { useCallback, useRef } from "react";
import type { MarkdownEditorHandle } from "@/components/markdown-editor";
import { ProseBlock } from "@/components/prose-block";
import { ObjectCard } from "@/components/object-card";
import { InsertPalette } from "@/components/insert-palette";
import {
  editorBlocks,
  insertAt,
  deleteToken,
  swapObjects,
  objectNeighbor,
  replaceRange,
  blockKey,
  type EditorInteraction,
} from "@/lib/story-editor";
import type { Photo } from "@/lib/types";
import { useT } from "@/components/i18n";

// Templates are intentionally INCOMPLETE (blank question / empty options) so a
// freshly inserted poll lands as editable prose text rather than a frozen card,
// letting the author fill it in. Once well-formed it renders as a card.
const POLL_TEMPLATE = ":::poll \n- \n- \n:::";
const QUIZ_TEMPLATE = ":::quiz \n- \n- = \n:::";

export function StoryEditor({
  body,
  onChange,
  photos,
  interactions,
  placeholder,
}: {
  body: string;
  onChange: (body: string) => void;
  photos: Photo[];
  interactions: EditorInteraction[];
  placeholder?: string;
}) {
  const t = useT();
  const blocks = editorBlocks(body, photos, interactions);

  // The caret position to insert at: the absolute body offset of the active
  // prose block's start plus the caret offset within it. Defaults to end-of-doc.
  const activeRef = useRef<{ start: number; caret: number }>({
    start: body.length,
    caret: 0,
  });
  // A one-shot focus request after a structural edit, kept in a ref so applying
  // it from a ProseBlock ref callback neither needs a re-render nor mutates
  // state during commit.
  const focusReq = useRef<{ key: string; offset: number } | null>(null);
  const proseRefs = useRef<Map<string, MarkdownEditorHandle | null>>(new Map());

  const insertToken = useCallback(
    (text: string) => {
      const { start, caret } = activeRef.current;
      const offset = Math.min(body.length, start + caret);
      const { body: next, caret: nextCaret } = insertAt(body, offset, text, {
        block: true,
      });
      // Request focus on whatever prose block the caret lands in afterwards, so a
      // photo insert returns the caret to the prose after it and a poll template
      // lands focused (ready to fill). Derived from the NEW body so the key and
      // local offset match what will render.
      const nextBlocks = editorBlocks(next, photos, interactions);
      const idx = nextBlocks.findIndex(
        (b) => b.kind === "prose" && nextCaret >= b.start && nextCaret <= b.end,
      );
      if (idx !== -1)
        focusReq.current = {
          key: blockKey(nextBlocks, idx),
          offset: nextCaret - nextBlocks[idx].start,
        };
      onChange(next);
    },
    [body, onChange, photos, interactions],
  );

  const editProse = (blockStart: number, blockEnd: number, text: string) => {
    onChange(replaceRange(body, blockStart, blockEnd, text));
  };

  const copyMarkdown = (start: number, end: number) => {
    const md = body.slice(start, end);
    void navigator.clipboard?.writeText(md);
  };

  const applyFocus = (key: string) => {
    const req = focusReq.current;
    if (!req || req.key !== key) return;
    proseRefs.current.get(key)?.focusAt(req.offset);
    focusReq.current = null;
  };

  return (
    <div className="space-y-2">
      <InsertPalette
        photos={photos}
        body={body}
        onInsertPhoto={(id) => insertToken(`[photo:${id}]`)}
        onInsertPoll={() => insertToken(POLL_TEMPLATE)}
        onInsertQuiz={() => insertToken(QUIZ_TEMPLATE)}
      />

      <div className="space-y-2">
        {blocks.map((b, i) => {
          const key = blockKey(blocks, i);
          if (b.kind === "prose") {
            return (
              <ProseBlock
                key={key}
                ref={(h) => {
                  if (h) {
                    proseRefs.current.set(key, h);
                    applyFocus(key);
                  } else {
                    proseRefs.current.delete(key);
                  }
                }}
                value={b.text}
                placeholder={i === 0 ? placeholder : t("admin.editor.emptyProse")}
                onFocusCaret={(offset) => {
                  activeRef.current = { start: b.start, caret: offset };
                }}
                onChange={(text) => editProse(b.start, b.end, text)}
              />
            );
          }
          const canUp = objectNeighbor(blocks, i, "up") !== -1;
          const canDown = objectNeighbor(blocks, i, "down") !== -1;
          return (
            <ObjectCard
              key={key}
              block={b}
              canUp={canUp}
              canDown={canDown}
              onMoveUp={() => {
                const next = swapObjects(body, blocks, i, "up");
                if (next) onChange(next);
              }}
              onMoveDown={() => {
                const next = swapObjects(body, blocks, i, "down");
                if (next) onChange(next);
              }}
              onDelete={() => onChange(deleteToken(body, b.start, b.end))}
              onCopy={() => copyMarkdown(b.start, b.end)}
            />
          );
        })}
      </div>
    </div>
  );
}
