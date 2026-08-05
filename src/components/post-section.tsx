"use client";
import { type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A collapsible stage card: header (icon, title, status summary, chevron) over
 *  its content. The shell controls `open`; the chevron rotates when expanded. */
export function PostSection({
  title,
  icon,
  summary,
  open,
  onToggle,
  accent = false,
  overflowVisible = false,
  className,
  children,
}: {
  title: string;
  icon: ReactNode;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  accent?: boolean;
  // Drop the corner-clipping `overflow-hidden` so a `position: sticky` child (an
  // in-section pinned toolbar) can stick to the viewport instead of being trapped
  // in this box. Safe only when the content is inset from the rounded corners.
  overflowVisible?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border",
        overflowVisible ? undefined : "overflow-hidden",
        accent ? "border-ember-500/40 bg-ember-500/5" : "border-white/10 bg-ink-900/40",
        className,
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span className={cn("shrink-0", accent ? "text-ember-400" : "text-sand-100/70")}>
          {icon}
        </span>
        <span className="font-display text-base font-semibold text-sand-50">{title}</span>
        {summary && (
          <span className="truncate text-xs text-sand-100/50">· {summary}</span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto size-4 shrink-0 text-sand-100/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="border-t border-white/5 p-4">{children}</div>}
    </section>
  );
}
