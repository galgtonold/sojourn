"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/components/i18n";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  applyFinding,
  parseProofKey,
  type Finding,
} from "@/lib/ai/proofread";

// Signature of the user-written content, used by the publish nudge to tell
// whether the current text has been proofread.
type Status = "pending" | "applied" | "skipped" | "stale";

export function ProofreadDialog({
  open,
  onClose,
  postId,
  lang,
  title,
  excerpt,
  body,
  onApply,
  onRan,
}: {
  open: boolean;
  onClose: () => void;
  postId: string;
  lang: "de" | "en";
  title: string;
  excerpt: string;
  body: string;
  onApply: (key: string, value: string) => void;
  /** The final text of every unit the dialog touched, keyed as sent. */
  onRan?: (draft: Record<string, string>) => void;
}) {
  const t = useT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [ran, setRan] = useState(false);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [status, setStatus] = useState<Record<string, Status>>({});
  // Cursor into the *unresolved* findings — applied/skipped ones drop out of the
  // queue, so it always points at something still to review.
  const [cursor, setCursor] = useState(0);
  // Working copy so sequential applies compose correctly and the parent can't
  // change underneath a modal. Keyed by unit key — the post fields are seeded on
  // open, captions arrive with the response because the dialog has never seen
  // them and needs the whole text, not the matched fragment, to compose fixes.
  const [draft, setDraft] = useState<Record<string, string>>({
    title,
    excerpt,
    body,
  });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setFindings([]);
    setStatus({});
    setCursor(0);
    setDraft({ title, excerpt, body });
    (async () => {
      try {
        const res = await fetch("/api/admin/ai/proofread", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ postId, title, excerpt, body, lang }),
        });
        if (!res.ok) throw new Error("proofread failed");
        const j = (await res.json()) as {
          findings: Finding[];
          extras?: { key: string; text: string }[];
          /** Previous name for `extras`; kept so an older server still works. */
          captions?: { key: string; text: string }[];
        };
        if (cancelled) return;
        // Seed the draft with the caption texts the server read. Without this,
        // `draft[key]` is empty for a caption and applyFinding cannot locate the
        // substring, so every caption fix would quietly mark itself "stale" —
        // findings visible, nothing applicable.
        setDraft((d) => {
          const next = { ...d };
          for (const u of j.extras ?? j.captions ?? []) next[u.key] = u.text;
          return next;
        });
        setFindings(j.findings ?? []);
        setRan(true);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-run only when the modal (re)opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // `aria-modal="true"` tells assistive technology that everything outside this
  // dialog is inert. Claiming that without trapping focus is worse than not
  // claiming it: a keyboard user tabs straight out into content their screen
  // reader has just been told does not exist. confirm-dialog next door does all
  // four of these; this one did none.
  //
  // Above the early return, and gated on `open`: a hook after a conditional
  // return runs in a different order on the render where it is skipped.
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  function close() {
    // The whole draft: captions, alt text and quiz answers included. The
    // workspace merges it over its own view to fingerprint what was proofread.
    if (ran) onRan?.(draft);
    setRan(false);
    onClose();
  }

  // Applying or skipping marks the finding resolved; it then drops out of the
  // queue and the cursor naturally lands on the next unresolved one (no need to
  // advance — the shrinking list does it). The cursor is clamped at render.
  function apply(f: Finding) {
    const cur = draft[f.key] ?? "";
    const next = applyFinding(cur, f.original, f.suggestion);
    if (next == null) {
      setStatus((s) => ({ ...s, [f.id]: "stale" }));
    } else {
      setDraft((d) => ({ ...d, [f.key]: next }));
      onApply(f.key, next);
      setStatus((s) => ({ ...s, [f.id]: "applied" }));
    }
  }

  function skip(f: Finding) {
    setStatus((s) => ({ ...s, [f.id]: "skipped" }));
  }

  function applyAll() {
    const next = { ...draft };
    const st: Record<string, Status> = { ...status };
    for (const f of findings) {
      if (st[f.id] === "applied" || st[f.id] === "skipped") continue;
      const r = applyFinding(next[f.key] ?? "", f.original, f.suggestion);
      if (r == null) st[f.id] = "stale";
      else {
        next[f.key] = r;
        st[f.id] = "applied";
      }
    }
    setDraft(next);
    // Every unit that actually moved, post field or caption alike.
    Object.keys(next).forEach((key) => {
      if (next[key] !== draft[key]) onApply(key, next[key]);
    });
    setStatus(st);
  }

  const appliedCount = Object.values(status).filter((s) => s === "applied").length;
  const skippedCount = Object.values(status).filter(
    (s) => s === "skipped" || s === "stale",
  ).length;
  // Only the findings still awaiting a decision; the cursor walks these.
  const pending = findings.filter((f) => !status[f.id]);
  const current = pending[Math.min(cursor, Math.max(0, pending.length - 1))];
  const reviewedAll = ran && findings.length > 0 && pending.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="proofread-dialog-title"
      onClick={close}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2
            id="proofread-dialog-title"
            className="font-display text-lg font-semibold text-sand-50"
          >
            {t("admin.proofread.title")}
          </h2>
          <button
            onClick={close}
            aria-label={t("admin.proofread.done")}
            className="text-sand-100/50 transition hover:text-sand-50"
          >
            <X className="size-5" />
          </button>
        </div>

        {loading && (
          <p className="mt-6 flex items-center gap-2 text-sm text-sand-100/70">
            <Loader2 className="size-4 animate-spin" />
            {t("admin.proofread.loading")}
          </p>
        )}
        {error && !loading && (
          <p className="mt-6 text-sm text-red-400">{t("admin.proofread.error")}</p>
        )}
        {!loading && !error && findings.length === 0 && (
          <p className="mt-6 text-sm text-sand-100/80">{t("admin.proofread.none")}</p>
        )}
        {!loading && !error && reviewedAll && (
          <p className="mt-6 flex items-center gap-2 text-sm text-sage-300">
            <Check className="size-4" /> {t("admin.proofread.allDone")}
          </p>
        )}

        {!loading && !error && current && (
          <div className="mt-4">
            <div className="flex items-center gap-2 text-xs text-sand-100/60">
              <span>
                {t("admin.proofread.progress", {
                  n: findings.findIndex((x) => x.id === current.id) + 1,
                  total: findings.length,
                })}
              </span>
              <span className="rounded-full bg-white/10 px-2 py-0.5">
                {(() => {
                  const target = parseProofKey(current.key);
                  if (!target) return current.key;
                  if (target.kind === "post") {
                    return t(`admin.proofread.field.${target.field}` as never);
                  }
                  // "Caption 4", "Quiz 2 · answer 3" — the number is where to
                  // look, which a key like caption:9f3c… cannot tell anyone.
                  const label = t(`admin.proofread.field.${target.kind}` as never);
                  const where = current.ordinal ? ` ${current.ordinal}` : "";
                  return target.kind === "option"
                    ? `${label}${where}·${target.index + 1}`
                    : `${label}${where}`;
                })()}
              </span>
              <span className="rounded-full bg-ember-500/15 px-2 py-0.5 text-ember-300">
                {t(`admin.proofread.type.${current.type}` as never)}
              </span>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              {/* The fix shown in its sentence: struck original, then the
                  suggestion, so the author sees where the change lands. */}
              <p className="rounded-lg bg-ink-800/70 px-3 py-2.5 leading-relaxed text-sand-100/85">
                <span className="text-sand-100/50">{current.before}</span>
                <del className="rounded bg-red-500/15 px-0.5 text-red-300 line-through decoration-red-400/60">
                  {current.original}
                </del>{" "}
                <ins className="rounded bg-sage-500/15 px-0.5 text-sage-200 no-underline">
                  {current.suggestion}
                </ins>
                <span className="text-sand-100/50">{current.after}</span>
              </p>
              <p className="text-xs text-sand-100/60">{current.explanation}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => apply(current)}
                className="inline-flex items-center gap-1 rounded-full bg-ember-500 px-4 py-1.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400"
              >
                <Check className="size-4" /> {t("admin.proofread.apply")}
              </button>
              <button
                onClick={() => skip(current)}
                className="rounded-full px-3 py-1.5 text-sm text-sand-100/70 transition hover:text-sand-50"
              >
                {t("admin.proofread.skip")}
              </button>
              <button
                onClick={applyAll}
                className="rounded-full px-3 py-1.5 text-sm text-sand-100/70 transition hover:text-sand-50"
              >
                {t("admin.proofread.applyAll")}
              </button>
              <span className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setCursor((c) => Math.max(0, c - 1))}
                  disabled={cursor <= 0}
                  aria-label={t("admin.proofread.prev")}
                  className="rounded-full p-1.5 text-sand-100/60 transition hover:text-sand-50 disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={() => setCursor((c) => Math.min(pending.length - 1, c + 1))}
                  disabled={cursor >= pending.length - 1}
                  aria-label={t("admin.proofread.next")}
                  className="rounded-full p-1.5 text-sand-100/60 transition hover:text-sand-50 disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3">
          <span className="text-xs text-sand-100/50">
            {t("admin.proofread.summary", { applied: appliedCount, skipped: skippedCount })}
          </span>
          <button
            onClick={close}
            className="rounded-full bg-white/10 px-4 py-1.5 text-sm text-sand-50 transition hover:bg-white/20"
          >
            {t("admin.proofread.done")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
