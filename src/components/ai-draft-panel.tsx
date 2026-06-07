"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, MessagesSquare, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

type Lang = "de" | "en";
type Section = {
  heading: string;
  beat: string;
  photo_ids: string[];
  interaction?: { kind: "poll" | "quiz"; idea: string } | null;
};
type Outline = {
  title: string;
  excerpt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_photo_id: string | null;
  sections: Section[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? "failed");
  return j as T;
}

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
  const [lang, setLang] = useState<Lang>("de");
  const [notes, setNotes] = useState(initialNotes);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [phase, setPhase] = useState<
    "idle" | "asking" | "answering" | "running" | "done"
  >("idle");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = phase === "asking" || phase === "running";

  async function suggestQuestions() {
    setPhase("asking");
    setError(null);
    try {
      const { questions } = await postJson<{ questions: string[] }>(
        "/api/admin/ai/questions",
        { postId, notes, lang },
      );
      setQuestions(questions ?? []);
      setPhase("answering");
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setPhase("idle");
    }
  }

  async function generate() {
    if (hasBody && !confirm(t("admin.ai.overwriteConfirm"))) return;
    setPhase("running");
    setError(null);
    const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
    try {
      // 1. Enrich photos in batches until none remain.
      setStep(t("admin.ai.step.enrich"));
      for (let guard = 0; guard < 50; guard++) {
        const { remaining } = await postJson<{ remaining: number }>(
          "/api/admin/ai/enrich-post",
          { postId },
        );
        if (remaining <= 0) break;
      }

      // 2. Outline.
      setStep(t("admin.ai.step.outline"));
      const { outline } = await postJson<{ outline: Outline }>(
        "/api/admin/ai/outline",
        { postId, notes, answers: qa, lang },
      );

      // 3. Write each section (one short request each).
      const parts: string[] = [];
      const total = outline.sections.length;
      for (let i = 0; i < total; i++) {
        setStep(t("admin.ai.step.section", { a: i + 1, b: total }));
        const { markdown } = await postJson<{ markdown: string }>(
          "/api/admin/ai/section",
          {
            postId,
            index: i,
            total,
            title: outline.title,
            section: outline.sections[i],
            notes,
            answers: qa,
            lang,
          },
        );
        if (markdown) parts.push(markdown);
      }

      // 4. Captions.
      setStep(t("admin.ai.step.captions"));
      await postJson("/api/admin/ai/captions", { postId, lang }).catch(() => {});

      // 5. Save the assembled draft.
      setStep(t("admin.ai.step.save"));
      await postJson("/api/admin/ai/save-draft", {
        postId,
        title: outline.title,
        excerpt: outline.excerpt,
        location: outline.location ?? undefined,
        lat: outline.lat ?? null,
        lng: outline.lng ?? null,
        cover_photo_id: outline.cover_photo_id ?? null,
        body: parts.join("\n\n"),
      });

      setStep(null);
      setPhase("done");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStep(null);
      setPhase(questions.length ? "answering" : "idle");
    }
  }

  async function autoCaption() {
    setPhase("running");
    setStep(t("admin.ai.autocaption"));
    setError(null);
    try {
      const { count } = await postJson<{ count: number }>(
        "/api/admin/ai/captions",
        { postId, lang, onlyEmpty: true },
      );
      setStep(null);
      setPhase("idle");
      setError(null);
      alert(t("admin.ai.autocaptionDone", { n: count }));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStep(null);
      setPhase("idle");
    }
  }

  return (
    <div className="rounded-2xl border border-ember-500/30 bg-ember-500/5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-ember-400" />
          <h2 className="font-display text-xl font-semibold">
            {t("admin.ai.title")}
          </h2>
        </div>
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-xs">
          {(["de", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              disabled={busy}
              className={cn(
                "rounded-full px-2.5 py-1 uppercase transition",
                lang === l ? "bg-white/10 text-sand-50" : "text-sand-100/50",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-sand-100/60">{t("admin.ai.subtitle")}</p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        disabled={busy}
        placeholder={t("admin.ai.notes")}
        className="mt-4 w-full resize-y rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
      />

      {phase === "answering" && questions.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-sand-100/60">{t("admin.ai.answersHint")}</p>
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

      {step && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ember-300">
          <Loader2 className="size-4 animate-spin" /> {step}…
        </p>
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
            <MessagesSquare className="size-4" />
            {t("admin.ai.suggestQuestions")}
          </button>
        )}
        <button
          onClick={generate}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {phase === "running" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {phase === "answering"
            ? t("admin.ai.generate")
            : t("admin.ai.skip")}
        </button>
        <button
          onClick={autoCaption}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-sand-100/80 transition hover:border-ember-400 disabled:opacity-50"
        >
          <Wand2 className="size-4" /> {t("admin.ai.autocaption")}
        </button>
      </div>
    </div>
  );
}
