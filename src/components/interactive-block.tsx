"use client";
import { useEffect, useState } from "react";
import { BarChart3, Check, HelpCircle, X } from "lucide-react";
import type { Interaction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

const VID_KEY = "sojourn:vid";

function visitorToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(VID_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(VID_KEY, t);
  }
  return t;
}

type State = {
  voted: boolean;
  counts?: number[];
  total?: number;
  yourChoice?: number;
  correctIndex?: number | null;
  explanation?: string | null;
};

export function InteractiveBlock({ interaction }: { interaction: Interaction }) {
  const { id, kind, question, options } = interaction;
  const [state, setState] = useState<State>({ voted: false });
  const [busy, setBusy] = useState(false);
  const t = useT();

  useEffect(() => {
    fetch(`/api/interactions?id=${id}&token=${encodeURIComponent(visitorToken())}`)
      .then((r) => r.json())
      .then((s) => setState(s))
      .catch(() => {});
  }, [id]);

  async function vote(choice: number) {
    if (state.voted || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, token: visitorToken(), choice }),
      });
      if (res.ok) setState(await res.json());
    } catch {
      // leave unvoted
    } finally {
      setBusy(false);
    }
  }

  const voted = state.voted;
  const total = state.total ?? 0;
  const gotItRight =
    kind === "quiz" && voted && state.yourChoice === state.correctIndex;

  return (
    <div className="my-8 rounded-3xl border border-white/10 bg-ink-900 p-5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-ember-300">
        {kind === "quiz" ? (
          <HelpCircle className="size-3.5" />
        ) : (
          <BarChart3 className="size-3.5" />
        )}
        {kind === "quiz" ? t("quiz.label") : t("poll.label")}
      </p>
      <p className="mt-2 font-display text-xl font-semibold leading-snug">
        {question}
      </p>

      <div className="mt-4 space-y-2">
        {options.map((opt, i) => {
          const count = state.counts?.[i] ?? 0;
          const pct = total ? Math.round((count / total) * 100) : 0;
          const isYours = state.yourChoice === i;
          const isCorrect = state.correctIndex === i;
          const isWrongPick =
            kind === "quiz" && isYours && state.correctIndex != null && !isCorrect;
          return (
            <button
              key={i}
              disabled={voted || busy}
              onClick={() => vote(i)}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm transition",
                !voted && "border-white/10 hover:border-ember-400",
                voted && "cursor-default border-white/10",
                voted && isCorrect && "border-sage-500/60",
                voted && isWrongPick && "border-red-500/50",
                voted && kind === "poll" && isYours && "border-ember-400/60",
              )}
            >
              {voted && (
                <span
                  className={cn(
                    "absolute inset-y-0 left-0",
                    isCorrect ? "bg-sage-500/15" : "bg-ember-500/12",
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {voted && isCorrect && (
                    <Check className="size-4 shrink-0 text-sage-400" />
                  )}
                  {isWrongPick && <X className="size-4 shrink-0 text-red-400" />}
                  {opt}
                </span>
                {voted && (
                  <span className="shrink-0 tabular-nums text-sand-100/60">
                    {pct}%
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {voted && (
        <p className="mt-3 text-xs text-sand-100/50">
          {kind === "quiz"
            ? gotItRight
              ? t("quiz.right")
              : t("quiz.wrong")
            : t("poll.thanks")}
          {total === 1
            ? t("interaction.response", { n: total })
            : t("interaction.responses", { n: total })}
        </p>
      )}
      {voted && kind === "quiz" && state.explanation && (
        <p className="mt-1 text-sm text-sand-100/70">{state.explanation}</p>
      )}
    </div>
  );
}
