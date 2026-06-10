"use client";
import { useRef } from "react";
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
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 14,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  function syncScroll() {
    const ta = taRef.current;
    const pre = preRef.current;
    if (ta && pre) {
      pre.scrollTop = ta.scrollTop;
      pre.scrollLeft = ta.scrollLeft;
    }
  }

  const shared =
    "m-0 box-border w-full whitespace-pre-wrap break-words rounded-xl border px-3 py-2.5 font-mono text-sm leading-relaxed";

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
}
