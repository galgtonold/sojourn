"use client";
import { useState } from "react";
import { Code2, Plus, Trash2, X } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
    setQuestion("");
    setOptions(["", ""]);
    setCorrectIndex(0);
    setExplanation("");
  }

  async function add() {
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) return setError("Add a question.");
    if (cleanOptions.length < 2) return setError("Add at least two options.");
    if (kind === "quiz" && correctIndex >= cleanOptions.length)
      return setError("Pick which option is correct.");

    const supabase = getBrowserSupabase();
    if (!supabase) return setError("Not available.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase
      .from("interactions")
      .insert({
        post_id: postId,
        kind,
        question: question.trim(),
        options: cleanOptions,
        correct_index: kind === "quiz" ? correctIndex : null,
        explanation: kind === "quiz" ? explanation.trim() || null : null,
        sort_order: list.length,
      })
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
        <h2 className="font-display text-2xl font-semibold">Polls & quizzes</h2>
        <p className="mt-0.5 text-sm text-sand-100/50">
          Create a block, then drop its <code className="text-sand-100/70">[ask:ID]</code>{" "}
          tag into the body. Saved automatically.
        </p>
      </div>

      {list.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl bg-ink-900 ring-1 ring-white/5">
          {list.map((it) => (
            <li key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="min-w-0">
                <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide text-sand-100/60">
                  {it.kind}
                </span>
                <span className="text-sm">{it.question}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => copyTag(it.id)}
                  className="inline-flex items-center gap-1 text-xs text-ember-400 hover:underline"
                >
                  <Code2 className="size-3.5" />
                  {copiedId === it.id ? "Copied!" : "Copy tag"}
                </button>
                <button
                  onClick={() => remove(it)}
                  aria-label="Delete"
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
                "rounded-full px-4 py-1 capitalize transition",
                kind === k ? "bg-ember-500 text-ink-950" : "text-sand-100/70",
              )}
            >
              {k}
            </button>
          ))}
        </div>

        <input
          className={input}
          placeholder="Question"
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
                  title="Mark as correct answer"
                  className="size-4 accent-[#1fb0a6]"
                />
              )}
              <input
                className={input}
                placeholder={`Option ${i + 1}`}
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
                  aria-label="Remove option"
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
            <Plus className="size-3.5" /> Add option
          </button>
        </div>

        {kind === "quiz" && (
          <textarea
            className={`${input} resize-y`}
            rows={2}
            placeholder="Explanation shown after answering (optional)"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
          />
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={add}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Plus className="size-4" /> {busy ? "Adding…" : `Add ${kind}`}
        </button>
      </div>
    </div>
  );
}
