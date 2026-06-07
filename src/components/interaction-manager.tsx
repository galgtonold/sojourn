"use client";
import { useState } from "react";
import { Code2, Pencil, Plus, Trash2, X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

export type ManagedInteraction = {
  id: string;
  kind: "poll" | "quiz";
  question: string;
  options: string[];
  correct_index: number | null;
  explanation: string | null;
};

export function InteractionManager({
  postId,
  slug,
  initial,
}: {
  postId: string;
  slug: string;
  initial: ManagedInteraction[];
}) {
  const [list, setList] = useState<ManagedInteraction[]>(initial);
  const [kind, setKind] = useState<"poll" | "quiz">("poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const t = useT();

  async function revalidate() {
    try {
      await fetch("/api/admin/revalidate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: `/posts/${slug}` }),
      });
    } catch {
      /* best effort */
    }
  }

  function reset() {
    setKind("poll");
    setQuestion("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setExplanation("");
    setEditingId(null);
    setError(null);
  }

  function startEdit(it: ManagedInteraction) {
    setEditingId(it.id);
    setKind(it.kind);
    setQuestion(it.question);
    setOptions(it.options.length >= 2 ? [...it.options] : [...it.options, ""]);
    setCorrectIndex(it.correct_index ?? 0);
    setExplanation(it.explanation ?? "");
    setError(null);
  }

  async function save() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError(t("admin.ask.errQuestion"));
    if (cleanOptions.length < 2) return setError(t("admin.ask.errOptions"));
    if (kind === "quiz" && correctIndex >= cleanOptions.length)
      return setError(t("admin.ask.errCorrect"));

    const supabase = getBrowserSupabase();
    if (!supabase) return setError(t("admin.account.errGeneric"));
    setBusy(true);
    setError(null);

    const payload = {
      kind,
      question: question.trim(),
      options: cleanOptions,
      correct_index: kind === "quiz" ? correctIndex : null,
      explanation: kind === "quiz" ? explanation.trim() || null : null,
    };

    if (editingId) {
      const { data, error } = await supabase
        .from("interactions")
        .update(payload)
        .eq("id", editingId)
        .select("id, kind, question, options, correct_index, explanation")
        .single();
      setBusy(false);
      if (error) return setError(error.message);
      setList((l) =>
        l.map((x) => (x.id === editingId ? (data as ManagedInteraction) : x)),
      );
      reset();
      revalidate();
      return;
    }

    const { data, error } = await supabase
      .from("interactions")
      .insert({ post_id: postId, ...payload, sort_order: list.length })
      .select("id, kind, question, options, correct_index, explanation")
      .single();
    setBusy(false);
    if (error) return setError(error.message);
    setList((l) => [...l, data as ManagedInteraction]);
    reset();
    revalidate();
  }

  async function remove(it: ManagedInteraction) {
    const supabase = getBrowserSupabase();
    if (!supabase) return;
    if (editingId === it.id) reset();
    setList((l) => l.filter((x) => x.id !== it.id));
    await supabase.from("interactions").delete().eq("id", it.id);
    revalidate();
  }

  async function copyTag(id: string) {
    try {
      await navigator.clipboard.writeText(`[ask:${id}]`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      /* no clipboard */
    }
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-sm outline-none focus:border-ember-400";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-2xl font-semibold">
          {t("admin.ask.title")}
        </h2>
        <p className="mt-0.5 text-sm text-sand-100/50">
          {t("admin.ask.subtitle")}
        </p>
      </div>

      {list.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
          {list.map((it) => (
            <li
              key={it.id}
              className={cn(
                "flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3",
                editingId === it.id && "bg-ember-500/10",
              )}
            >
              <span className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-sand-100/60">
                  {it.kind === "poll" ? t("poll.label") : t("quiz.label")}
                </span>
                <span className="min-w-0 break-words text-sm">{it.question}</span>
              </span>
              <span className="flex shrink-0 items-center gap-4 self-end sm:gap-3 sm:self-auto">
                <button
                  onClick={() => startEdit(it)}
                  className="inline-flex items-center gap-1 text-xs text-sand-100/70 hover:text-sand-50"
                >
                  <Pencil className="size-3.5" /> {t("admin.ask.edit")}
                </button>
                <button
                  onClick={() => copyTag(it.id)}
                  className="inline-flex items-center gap-1 text-xs text-ember-400 hover:underline"
                >
                  <Code2 className="size-3.5" />
                  {copiedId === it.id
                    ? t("admin.ask.copied")
                    : t("admin.ask.copyTag")}
                </button>
                <button
                  onClick={() => remove(it)}
                  aria-label={t("admin.ask.delete")}
                  className="text-red-400/80 hover:text-red-400"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Builder */}
      <div className="space-y-3 rounded-2xl bg-ink-900 p-4 ring-1 ring-white/5">
        <div className="inline-flex rounded-full border border-white/10 p-0.5 text-sm">
          {(["poll", "quiz"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-full px-4 py-1 transition",
                kind === k ? "bg-ember-500 text-ink-950" : "text-sand-100/70",
              )}
            >
              {k === "poll" ? t("poll.label") : t("quiz.label")}
            </button>
          ))}
        </div>

        <input
          className={input}
          placeholder={t("admin.ask.question")}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <div className="space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              {kind === "quiz" && (
                <input
                  type="radio"
                  name="correct"
                  checked={correctIndex === i}
                  onChange={() => setCorrectIndex(i)}
                  title={t("admin.ask.markCorrect")}
                  className="size-4 accent-[#1fb0a6]"
                />
              )}
              <input
                className={input}
                placeholder={t("admin.ask.option", { n: i + 1 })}
                value={opt}
                onChange={(e) =>
                  setOptions((o) => o.map((v, j) => (j === i ? e.target.value : v)))
                }
              />
              {options.length > 2 && (
                <button
                  onClick={() => {
                    setOptions((o) => o.filter((_, j) => j !== i));
                    setCorrectIndex((c) => (c >= i && c > 0 ? c - 1 : c));
                  }}
                  aria-label={t("admin.ask.removeOption")}
                  className="text-sand-100/40 hover:text-sand-100"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setOptions((o) => [...o, ""])}
            className="inline-flex items-center gap-1 text-xs text-ember-400 hover:underline"
          >
            <Plus className="size-3.5" /> {t("admin.ask.addOption")}
          </button>
        </div>

        {kind === "quiz" && (
          <textarea
            className={`${input} resize-y`}
            rows={2}
            placeholder={t("admin.ask.explanation")}
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
          >
            <Plus className="size-4" />{" "}
            {busy
              ? t("admin.ask.adding")
              : editingId
                ? t("admin.ask.save")
                : kind === "poll"
                  ? t("admin.ask.addPoll")
                  : t("admin.ask.addQuiz")}
          </button>
          {editingId && (
            <button
              onClick={reset}
              className="rounded-full px-3 py-2 text-sm text-sand-100/60 hover:text-sand-100"
            >
              {t("admin.ask.cancel")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
