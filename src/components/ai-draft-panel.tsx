"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, MessagesSquare } from "lucide-react";
import { useT } from "@/components/i18n";

export function AiDraftPanel({
  postId,
  initialNotes,
  hasBody,
}: {
  postId: string;
  initialNotes: string;
  hasBody: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [phase, setPhase] = useState<
    "idle" | "asking" | "answering" | "drafting" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  async function suggestQuestions() {
    setPhase("asking");
    setError(null);
    try {
      const res = await fetch("/api/admin/ai/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ postId, notes }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "failed");
      setQuestions(j.questions ?? []);
      setPhase("answering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setPhase("idle");
    }
  }

  async function generate() {
    if (hasBody && !confirm(t("admin.ai.overwriteConfirm"))) return;
    setPhase("drafting");
    setError(null);
    try {
      const payload = {
        postId,
        notes,
        answers: questions.map((q, i) => ({
          question: q,
          answer: answers[i] ?? "",
        })),
      };
      const res = await fetch("/api/admin/ai/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "failed");
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setPhase("answering");
    }
  }

  const busy = phase === "asking" || phase === "drafting";

  return (
    <div className="rounded-2xl border border-ember-500/30 bg-ember-500/5 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-ember-400" />
        <h2 className="font-display text-xl font-semibold">
          {t("admin.ai.title")}
        </h2>
      </div>
      <p className="mt-1 text-sm text-sand-100/60">{t("admin.ai.subtitle")}</p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder={t("admin.ai.notes")}
        className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
      />

      {phase === "answering" && questions.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-sand-100/60">
            {t("admin.ai.answersHint")}
          </p>
          {questions.map((q, i) => (
            <div key={i}>
              <label className="text-sm text-sand-100/80">{q}</label>
              <input
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((a) => ({ ...a, [i]: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400"
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {phase === "done" && (
        <p className="mt-3 text-sm text-lagoon-400">{t("admin.ai.done")}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {phase !== "answering" && (
          <button
            onClick={suggestQuestions}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400 disabled:opacity-50"
          >
            {phase === "asking" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <MessagesSquare className="size-4" />
            )}
            {t("admin.ai.suggestQuestions")}
          </button>
        )}
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {phase === "drafting" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> {t("admin.ai.generating")}
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              {phase === "answering"
                ? t("admin.ai.generate")
                : t("admin.ai.skip")}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
