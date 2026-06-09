"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useT } from "@/components/i18n";

/**
 * A small AI helper in the voyage editor: it asks a few clarifying questions
 * about the trip, then folds the author's answers into a refined internal
 * context string (used only to ground AI post generation, never shown publicly).
 */
export function AiContextRefiner({
  tripId,
  title,
  summary,
  context,
  onApply,
}: {
  tripId?: string;
  title: string;
  summary: string;
  context: string;
  onApply: (context: string) => void;
}) {
  const t = useT();
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<"questions" | "refine" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(mode: "questions" | "refine") {
    setBusy(mode);
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/trip-context", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          tripId,
          title,
          summary,
          context,
          answers:
            mode === "refine"
              ? questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }))
              : undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "AI error");
      if (mode === "questions") {
        setQuestions(j.questions ?? []);
        setAnswers({});
      } else if (typeof j.context === "string") {
        onApply(j.context);
        setQuestions([]);
        setAnswers({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-sand-100/70">
          <Sparkles className="size-3.5 text-ember-400" />
          {t("admin.trip.aiRefineTitle")}
        </p>
        <button
          type="button"
          onClick={() => call("questions")}
          disabled={busy !== null}
          className="rounded-full bg-ember-500/15 px-3 py-1.5 text-xs font-medium text-ember-300 transition hover:bg-ember-500/25 disabled:opacity-50"
        >
          {busy === "questions" ? t("admin.trip.aiThinking") : t("admin.trip.aiAsk")}
        </button>
      </div>

      {questions.length > 0 && (
        <div className="mt-3 space-y-3">
          {questions.map((q, i) => (
            <div key={i}>
              <p className="text-xs text-sand-100/80">{q}</p>
              <input
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [i]: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-900 px-2.5 py-1.5 text-sm outline-none focus:border-ember-400"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => call("refine")}
            disabled={busy !== null}
            className="rounded-full bg-ember-500 px-4 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
          >
            {busy === "refine"
              ? t("admin.trip.aiWriting")
              : t("admin.trip.aiGenerate")}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
