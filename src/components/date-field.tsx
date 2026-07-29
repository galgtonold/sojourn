"use client";
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { monthGrid, addMonths, isoToday } from "@/lib/calendar";
import { useI18n, useT } from "@/components/i18n";

// A calendar the site draws itself.
//
// `<input type="date">` is fine until you look at it: the control renders in the
// browser's own chrome and the popup can't be styled at all, so on Windows it
// drops a bright system calendar into the middle of a dark editor. It also
// prints the date in the browser's locale rather than the site's, so the editor
// disagreed with every date the reader sees.
//
// Month names and weekday initials come from Intl in the reader's language, so
// this needs no translations of its own beyond the two buttons.

const WEEK_ANCHOR = new Date(2024, 0, 1); // a Monday, for weekday labels

export function DateField({
  value,
  onChange,
  id,
}: {
  /** YYYY-MM-DD, or "" for unset. */
  value: string;
  onChange: (iso: string) => void;
  id?: string;
}) {
  const t = useT();
  const { locale } = useI18n();
  const tag = locale === "de" ? "de-DE" : "en-GB";

  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // The month on screen. Follows `value` when it changes underneath us (loading
  // a post, or clearing), but stays put while the user pages around.
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
  const [view, setView] = useState(() => monthOf(selected));
  useEffect(() => {
    setView(monthOf(selected));
  }, [selected]);

  // Close on an outside click or Escape — a popover that only closes by
  // re-clicking the trigger feels stuck.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = isoToday();
  const cells = monthGrid(view.year, view.month);
  const monthLabel = new Date(view.year, view.month, 1).toLocaleDateString(tag, {
    month: "long",
    year: "numeric",
  });

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <div ref={wrap} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-ink-800 px-3 py-2.5 text-left text-sm transition",
          open ? "border-ember-400" : "border-white/10 hover:border-ember-400",
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-ember-400" />
        <span className={cn("flex-1 truncate", value ? "text-sand-100/90" : "text-sand-100/40")}>
          {value ? formatDate(value, locale) : t("admin.editor.date.none")}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={monthLabel}
          className="glass absolute left-0 top-full z-50 mt-2 w-[19rem] rounded-2xl p-3 shadow-2xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v.year, v.month, -1))}
              aria-label={t("admin.editor.date.prevMonth")}
              className="grid size-8 place-items-center rounded-full text-sand-100/70 transition hover:bg-white/10 hover:text-sand-50"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="font-display text-sm font-semibold text-sand-50">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setView((v) => addMonths(v.year, v.month, 1))}
              aria-label={t("admin.editor.date.nextMonth")}
              className="grid size-8 place-items-center rounded-full text-sand-100/70 transition hover:bg-white/10 hover:text-sand-50"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center text-[0.65rem] uppercase tracking-wider text-sand-100/40">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="py-1">
                {new Date(
                  WEEK_ANCHOR.getFullYear(),
                  WEEK_ANCHOR.getMonth(),
                  WEEK_ANCHOR.getDate() + i,
                ).toLocaleDateString(tag, { weekday: "short" })}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c) => {
              const isSelected = c.iso === selected;
              const isToday = c.iso === today;
              return (
                <button
                  key={c.iso}
                  type="button"
                  onClick={() => pick(c.iso)}
                  aria-current={isSelected ? "date" : undefined}
                  className={cn(
                    "grid h-9 place-items-center rounded-lg text-sm transition",
                    isSelected
                      ? "bg-ember-500 font-semibold text-ink-950"
                      : c.inMonth
                        ? "text-sand-100/85 hover:bg-white/10"
                        : "text-sand-100/25 hover:bg-white/5",
                    // A ring rather than a fill, so "today" never competes with
                    // the selected day for attention.
                    !isSelected && isToday && "ring-1 ring-inset ring-ember-400/50",
                  )}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={() => pick(today)}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-ember-400 transition hover:bg-white/5"
            >
              {t("admin.editor.date.today")}
            </button>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-full px-2.5 py-1 text-xs text-sand-100/50 transition hover:bg-white/5 hover:text-sand-100/80"
            >
              {t("admin.editor.date.clear")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The month to show: the selected date's, or the current one when unset. */
function monthOf(iso: string): { year: number; month: number } {
  if (iso) {
    const [y, m] = iso.split("-").map(Number);
    return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}
