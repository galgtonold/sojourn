"use client";
import { forwardRef } from "react";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown-editor";

/** One editable markdown slice in the story editor stack. Thin wrapper over
 *  MarkdownEditor that forwards the imperative handle (so the orchestrator can
 *  focus it after an insert) and reports the caret offset on focus/selection. */
export const ProseBlock = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (text: string) => void;
    onFocusCaret: (offset: number) => void;
    placeholder?: string;
  }
>(function ProseBlock({ value, onChange, onFocusCaret, placeholder }, ref) {
  return (
    <MarkdownEditor
      ref={ref}
      value={value}
      onChange={onChange}
      onCaretChange={onFocusCaret}
      placeholder={placeholder}
      rows={Math.max(2, value.split("\n").length)}
    />
  );
});
