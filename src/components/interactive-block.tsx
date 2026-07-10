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

export function InteractiveBlock({
  interaction,
  preview = false,
}: {
  interaction: Interaction;
  // The admin preview renders the real article; a vote here must NOT be
  // recorded, or it would carry over into the published tally.
  preview?: boolean;
}) {
  const { id, kind, question, options } = interaction;
  const [state, setState] = useState<State>({ voted: false });
  const [busy, setBusy] = useState(false);
  const t = useT();

  // Pre-fetch the current tally on load (the API sends it even before voting, and
  // we keep it hidden until they vote) so the optimistic result is accurate. Don't
  // overwrite a vote if this resolves after a quick tap.
  useEffect(() => {
    let active = true;
    fetch(`/api/interactions?id=${id}&token=${encodeURIComponent(visitorToken())}`)
      .then((r) => r.json())
      .then((s) => {
        if (active) setState((prev) => (prev.voted ? prev : s));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);

  async function vote(choice: number) {
    if (state.voted || busy) return;
    setBusy(true);
    // Show the result instantly so the tap feels immediate. Add this vote to the
    // tally we pre-fetched on load, so the bars are already accurate — no "you're
    // the only one" flash. The server response then reconciles any votes that
    // landed since load (a small, smoothly-animated adjustment, if any). For a
    // quiz the correct answer still arrives with that response.
    setState((s) => {
      const base = s.counts ?? options.map(() => 0);
      return {
        ...s,
        voted: true,
        yourChoice: choice,
        counts: base.map((c, i) => (i === choice ? c + 1 : c)),
        total: (s.total ?? 0) + 1,
      };
    });
    // In the admin preview, stop here: the optimistic result (and, for a quiz,
    // the correct answer already pre-fetched via GET) is enough to preview the
    // interaction, and skipping the POST keeps draft votes out of the real tally.
    if (preview) {
      setBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/interactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, token: visitorToken(), choice }),
      });
      if (res.ok) setState(await res.json());
      // On a non-OK response keep the optimistic state — a casual poll vote that
      // didn't persist isn't worth yanking the result back out from under them.
    } catch {
      // Offline / network blip: keep the optimistic result rather than revert.
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
                    "absolute inset-y-0 left-0 transition-[width] duration-300 ease-out",
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
