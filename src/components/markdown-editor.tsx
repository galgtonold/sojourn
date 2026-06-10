"use client";
import { forwardRef, useImperativeHandle, useRef } from "react";
import { cn } from "@/lib/utils";

// Inline styles (not Tailwind classes) because the highlighted markup is
// injected as an HTML string, which Tailwind's scanner never sees.
const S = {
  head: "color:#ff8f4d;font-weight:600",
  bold: "color:#fdf0dd;font-weight:700",
  link: "color:#5ec8be",
  tag: "color:#f56a1f",
  quote: "color:#a99b88;font-style:italic",
  list: "color:#ff8f4d",
  dir: "color:#c98bf0;font-weight:600",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inline(s: string): string {
  return s
    .replace(
      /\[(?:photo|ask):[^\]\s]+\]/g,
      (m) => `<span style="${S.tag}">${m}</span>`,
    )
    .replace(/\[[^\]]+\]\([^)]+\)/g, (m) => `<span style="${S.link}">${m}</span>`)
    .replace(/\*\*[^*\n]+\*\*/g, (m) => `<span style="${S.bold}">${m}</span>`);
}

/** Tokenise markdown into a styled HTML string mirroring the textarea text. */
function highlight(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const e = inline(esc(line));
      if (/^#{1,6}\s/.test(line)) return `<span style="${S.head}">${e}</span>`;
      if (/^>\s?/.test(line)) return `<span style="${S.quote}">${e}</span>`;
      if (/^\s*[-*]\s/.test(line)) return `<span style="${S.list}">${e}</span>`;
      if (/^:::/.test(line)) return `<span style="${S.dir}">${e}</span>`;
      return e;
    })
    .join("\n");
}

/**
 * A markdown textarea with live syntax highlighting: a styled <pre> sits behind
 * a transparent-text textarea, kept pixel-aligned (same font/size/padding/wrap)
 * and scroll-synced. The caret + placeholder stay visible.
 */
export type MarkdownEditorHandle = {
  /** Insert text at the caret (replacing any selection). `block: true` puts it
   *  on its own line — used for [photo:…] / [ask:…] tags. */
  insertAtCursor: (text: string, opts?: { block?: boolean }) => void;
};

export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    rows?: number;
  }
>(function MarkdownEditor({ value, onChange, placeholder, rows = 14 }, ref) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      insertAtCursor(text, opts) {
        const ta = taRef.current;
        const start = ta?.selectionStart ?? value.length;
        const end = ta?.selectionEnd ?? value.length;
        let ins = text;
        if (opts?.block) {
          const before = value.slice(0, start);
          const after = value.slice(end);
          ins =
            (before && !before.endsWith("\n") ? "\n" : "") +
            text +
            (after && !after.startsWith("\n") ? "\n" : "");
        }
        onChange(value.slice(0, start) + ins + value.slice(end));
        const caret = start + ins.length;
        requestAnimationFrame(() => {
          const el = taRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(caret, caret);
          }
        });
      },
    }),
    [value, onChange],
  );

  function syncScroll() {
    const ta = taRef.current;
    const pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }

  // scrollbar-gutter:stable on BOTH layers reserves the same right gutter, so
  // the highlighted <pre> (no scrollbar) wraps at the same column as the
  // <textarea> (which has one) instead of running wider / past the edge.
  const shared =
    "m-0 box-border w-full whitespace-pre-wrap break-words rounded-xl border px-3 py-2.5 font-mono text-sm leading-relaxed [scrollbar-gutter:stable]";

  return (
    <div className="relative">
      <pre
        ref={preRef}
        aria-hidden
        className={cn(
          shared,
          "pointer-events-none absolute inset-0 overflow-hidden border-transparent bg-ink-800 text-sand-100",
        )}
        dangerouslySetInnerHTML={{ __html: highlight(value) + "\n" }}
      />
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        rows={rows}
        spellCheck={false}
        className={cn(
          shared,
          "relative resize-y border-white/10 bg-transparent text-transparent caret-ember-400 outline-none placeholder:text-sand-100/40 focus:border-ember-400",
        )}
      />
    </div>
  );
});
