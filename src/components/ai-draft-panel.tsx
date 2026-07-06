"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  MessagesSquare,
  Wand2,
  ImageUp,
  Square,
  ListPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { invalidPhotoRefs } from "@/lib/photo-refs";
import type { ManagedInteraction } from "@/components/interaction-manager";
import {
  maskProtectedTokens,
  allMasksPresent,
  restoreProtectedTokens,
  stripWrappingCodeFence,
} from "@/lib/ai/token-mask";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

type Lang = "de" | "en";
type Section = {
  heading: string;
  beat: string;
  photo_ids: string[];
  interaction?: { kind: "poll" | "quiz"; idea: string } | null;
  // Ids of the author's pre-defined interactions placed in this section.
  interaction_refs?: string[];
};
type Outline = {
  title: string;
  excerpt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_photo_id: string | null;
  date?: string | null;
  sections: Section[];
};

// The fields save-draft persisted, handed back so the editor can re-seed itself
// the instant generation finishes (no wait for router.refresh to propagate).
export type DraftSaved = {
  title: string;
  excerpt: string | null;
  body: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  cover_image: string | null;
  published_at: string | null;
  // The post's interactions after materialisation, so the editor re-seeds its
  // list and freshly-created [ask:id] tags resolve without a manual reload.
  interactions: ManagedInteraction[];
};

async function postJson<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as { error?: string }).error ?? "failed");
  return j as T;
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

// A 2s wait that resolves early — and rejects — if the run is interrupted, so
// Stop feels instant even mid-poll.
function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const tm = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(tm);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

// Retry a flaky step a few times before giving up — generation spans many model
// calls, and a single transient blip shouldn't sink the whole run.
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// Poll an enqueued LLM job until it finishes. Slow generations run on the Edge
// Function and land asynchronously in ai_jobs, so the client waits here.
async function pollJob(jobId: string, signal?: AbortSignal): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const res = await fetch(`/api/admin/ai/job/${jobId}`, { signal });
    const j = (await res.json().catch(() => ({}))) as {
      status?: string;
      output?: string;
      error?: string;
    };
    if (!res.ok) throw new Error(j.error ?? "poll failed");
    if (j.status === "done") return j.output ?? "";
    if (j.status === "error") throw new Error(j.error ?? "generation failed");
    await wait(2000, signal);
  }
  throw new Error("timed out");
}

// Turn a raw error into something a non-engineer can act on.
function humanError(e: unknown, t: (k: string) => string): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/parse|json/i.test(raw)) return t("admin.ai.err.parse");
  if (/\b(429|rate)\b/i.test(raw)) return t("admin.ai.err.rate");
  if (/\b5\d\d\b|network|fetch|timeout|abort/i.test(raw))
    return t("admin.ai.err.network");
  return raw;
}

export function AiDraftPanel({
  postId,
  initialNotes,
  hasBody,
  onDraftSaved,
  onPhotosUpdated,
  onBeforeGenerate,
  onNotesDirty,
}: {
  postId: string;
  initialNotes: string;
  hasBody: boolean;
  onDraftSaved?: (saved: DraftSaved) => void;
  // Called after a captioning pass writes photo captions server-side, so the
  // gallery re-pulls and the labels show without a manual reload.
  onPhotosUpdated?: () => void;
  onBeforeGenerate?: () => Promise<void>;
  // Reports whether the notes textarea holds edits not yet persisted, so the
  // workspace's leave-guard can warn before the tab is closed mid-type.
  onNotesDirty?: (dirty: boolean) => void;
}) {
  const t = useT();
  const confirm = useConfirm();
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("de");
  const [notes, setNotes] = useState(initialNotes);
  // Last value known to be persisted server-side. The notes textarea is plain
  // React state — the main Save never carried it — so without this it lived only
  // in the tab and vanished on reload. We autosave every edit to ai_notes.
  const savedNotesRef = useRef(initialNotes);
  // Always-current notes, so the pagehide flush reads the latest value without
  // re-subscribing the listener on every keystroke.
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Persist the notes to their own column (best effort). `keepalive` lets the
  // request outlive an unloading page, so a reload right after typing still
  // saves. No-ops when nothing changed since the last successful save.
  const persistNotes = useCallback(
    async (value: string, keepalive = false) => {
      if (value === savedNotesRef.current) return;
      try {
        const res = await fetch("/api/admin/ai/notes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ postId, notes: value }),
          keepalive,
        });
        if (!res.ok) return; // leave it dirty so a later flush/leave-guard retries
        savedNotesRef.current = value;
        onNotesDirty?.(false);
      } catch {
        /* still dirty; the pagehide flush or next edit will retry */
      }
    },
    [postId, onNotesDirty],
  );
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [phase, setPhase] = useState<
    "idle" | "asking" | "answering" | "running" | "done"
  >("idle");
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  // True once at least one round of answers has been folded into the notes, so
  // the question button reads "Ask more" rather than "Suggest questions".
  const [asked, setAsked] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const busy = phase === "asking" || phase === "running";

  // Debounced autosave: whenever the notes drift from what's saved, mark dirty
  // and persist shortly after typing stops. Skipped while an AI run is in
  // flight — those flows (questions/outline) persist the notes themselves.
  useEffect(() => {
    if (busy) return;
    if (notes === savedNotesRef.current) {
      onNotesDirty?.(false);
      return;
    }
    onNotesDirty?.(true);
    const id = setTimeout(() => void persistNotes(notes), 800);
    return () => clearTimeout(id);
  }, [notes, busy, persistNotes, onNotesDirty]);

  // Final safety net: flush any unsaved notes when the tab is closed, reloaded,
  // or backgrounded — before the debounce would have fired. `keepalive` keeps
  // the request alive through the unload.
  useEffect(() => {
    const flush = () => void persistNotes(notesRef.current, true);
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [persistNotes]);

  // Interrupt an in-flight run. The notes and any answers stay put, so you can
  // adjust them and go again. Server-side jobs already enqueued finish on their
  // own and are simply ignored — the next run starts clean.
  function stop() {
    abortRef.current?.abort();
  }

  // Fold the answered questions into the persisted notes, so they become part of
  // the context for good (surviving later edits) instead of one-shot inputs. From
  // here you can ask another round — now informed by the richer context — or
  // generate.
  async function addToContext() {
    const filled = questions
      .map((q, i) => ({ q, a: (answers[i] ?? "").trim() }))
      .filter((x) => x.a);
    if (filled.length) {
      const block = filled.map((x) => `F: ${x.q}\nA: ${x.a}`).join("\n\n");
      const next = notes.trim() ? `${notes.trim()}\n\n${block}` : block;
      setNotes(next);
      setAsked(true);
      // Persist so the woven-in answers aren't lost if they leave without
      // generating. Best effort — the next AI call would persist them anyway.
      void persistNotes(next);
    }
    setQuestions([]);
    setAnswers({});
    setError(null);
    setPhase("idle");
  }

  async function suggestQuestions() {
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("asking");
    setError(null);
    try {
      // Enrich photos first so the questions are informed by what's actually in
      // them (no asking about things the photos already show). Best effort, and
      // it makes generate's later enrich step a no-op — not extra work.
      setStep(t("admin.ai.step.enrich"));
      for (let guard = 0; guard < 50; guard++) {
        try {
          const { remaining } = await postJson<{ remaining: number }>(
            "/api/admin/ai/enrich-post",
            { postId },
            ac.signal,
          );
          if (remaining <= 0) break;
        } catch (e) {
          if (isAbort(e)) throw e;
          break;
        }
      }
      setStep(t("admin.ai.step.questions"));
      const { questions } = await postJson<{ questions: string[] }>(
        "/api/admin/ai/questions",
        { postId, notes, lang },
        ac.signal,
      );
      // The route just wrote these notes to ai_notes — record that so autosave
      // doesn't redundantly re-post the same value.
      savedNotesRef.current = notes;
      onNotesDirty?.(false);
      setQuestions(questions ?? []);
      setStep(null);
      setPhase("answering");
    } catch (e) {
      setStep(null);
      if (isAbort(e)) {
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : "failed");
      setPhase("idle");
    } finally {
      abortRef.current = null;
    }
  }

  async function generate() {
    if (hasBody && !(await confirm({ message: t("admin.ai.overwriteConfirm") }))) return;
    const ac = new AbortController();
    abortRef.current = ac;
    const signal = ac.signal;
    setPhase("running");
    setError(null);
    setWarn(null);
    // Persist any unsaved editor changes (e.g. an edited or cleared location) so
    // the dossier reflects the author's current intent. Best effort.
    try {
      await onBeforeGenerate?.();
    } catch {
      /* fall back to the saved draft */
    }
    const qa = questions.map((q, i) => ({ question: q, answer: answers[i] ?? "" }));
    try {
      // 1. Enrich photos in batches until none remain (best effort — captions
      //    can be filled later, so a hiccup here shouldn't block the draft).
      setStep(t("admin.ai.step.enrich"));
      for (let guard = 0; guard < 50; guard++) {
        try {
          const { remaining } = await postJson<{ remaining: number }>(
            "/api/admin/ai/enrich-post",
            { postId },
            signal,
          );
          if (remaining <= 0) break;
        } catch {
          break;
        }
      }

      // 2. Outline (retried — a usable plan is the backbone of the whole draft).
      setStep(t("admin.ai.step.outline"));
      const { outline } = await withRetry(() =>
        postJson<{ outline: Outline }>(
          "/api/admin/ai/outline",
          {
            postId,
            notes,
            answers: qa,
            lang,
          },
          signal,
        ),
      );
      // Outline persisted these notes to ai_notes; sync so autosave stays quiet.
      savedNotesRef.current = notes;
      onNotesDirty?.(false);

      // 3. Write each section (retried independently). A section that keeps
      //    failing is skipped rather than sinking the run, so the draft still
      //    captures everything that did write — progress is never thrown away.
      const parts: string[] = [];
      const failed: number[] = [];
      let photoFlagged = 0;
      const total = outline.sections.length;
      for (let i = 0; i < total; i++) {
        setStep(t("admin.ai.step.section", { a: i + 1, b: total }));
        try {
          const section = outline.sections[i];
          const allowed = section.photo_ids ?? [];
          const req = {
            postId,
            index: i,
            total,
            title: outline.title,
            section,
            // The whole plan, so each section stays out of the others' material.
            outline: outline.sections.map((s) => ({
              heading: s.heading,
              beat: s.beat,
            })),
            notes,
            answers: qa,
            lang,
          };
          // Enqueue the (slow) section generation, then poll the job for its
          // markdown — the work runs on the Edge Function, off this request.
          const { jobId } = await withRetry(() =>
            postJson<{ jobId: string }>("/api/admin/ai/section", req, signal),
          );
          let markdown = await pollJob(jobId, signal);

          // If the model invented photo ids, feed them back for one repair pass
          // before giving up — the section route forbids them explicitly.
          let invalid = invalidPhotoRefs(markdown, allowed);
          if (invalid.length) {
            try {
              const { jobId: repairId } = await withRetry(() =>
                postJson<{ jobId: string }>(
                  "/api/admin/ai/section",
                  {
                    ...req,
                    avoidPhotoIds: invalid,
                  },
                  signal,
                ),
              );
              const repaired = await pollJob(repairId, signal);
              if (repaired) {
                markdown = repaired;
                invalid = invalidPhotoRefs(markdown, allowed);
              }
            } catch {
              /* keep the first attempt; it's flagged below either way */
            }
          }
          // Still invented after the retry — leave it in (the editor lints each
          // dangling ref) but warn so the author knows to check.
          if (invalid.length) photoFlagged += 1;
          if (markdown) parts.push(markdown);
        } catch (e) {
          if (isAbort(e)) throw e; // a stop ends the whole run, not just a section
          failed.push(i + 1);
        }
      }

      if (parts.length === 0) throw new Error(t("admin.ai.err.noSections"));

      // 4. Homogenize: stitch the independently-written sections into one
      //    coherent article (smooth transitions, drop repetition and stray
      //    sign-offs). Best effort — photo/interaction tokens are masked so the
      //    rewrite can't corrupt a UUID or quiz, and any failure (or a dropped
      //    sentinel) falls back to the raw concatenation.
      const rawBody = parts.join("\n\n");
      let body = rawBody;
      if (parts.length >= 2) {
        setStep(t("admin.ai.step.homogenize"));
        try {
          const { masked, tokens } = maskProtectedTokens(rawBody);
          const { jobId } = await postJson<{ jobId: string }>(
            "/api/admin/ai/homogenize",
            { postId, lang, body: masked },
            signal,
          );
          const out = stripWrappingCodeFence(await pollJob(jobId, signal));
          if (out && allMasksPresent(out, tokens)) {
            body = restoreProtectedTokens(out, tokens);
          }
        } catch (e) {
          if (isAbort(e)) throw e;
          /* keep the raw concatenation */
        }
      }

      // 5. Captions (best effort). Pass the assembled body so captions are
      //    anchored in the article's voice, not standalone image descriptions.
      setStep(t("admin.ai.step.captions"));
      await postJson("/api/admin/ai/captions", { postId, lang, body }, signal).catch(
        () => {},
      );

      // 6. Save the assembled draft (retried — never lose finished prose).
      setStep(t("admin.ai.step.save"));
      const saveRes = await withRetry(() =>
        postJson<{
          ok: boolean;
          post: Omit<DraftSaved, "interactions"> | null;
          interactions: ManagedInteraction[];
        }>(
          "/api/admin/ai/save-draft",
          {
            postId,
            title: outline.title,
            excerpt: outline.excerpt,
            location: outline.location ?? undefined,
            lat: outline.lat ?? null,
            lng: outline.lng ?? null,
            cover_photo_id: outline.cover_photo_id ?? null,
            date: outline.date ?? undefined,
            body,
          },
          signal,
        ),
      );
      const saved = saveRes.post;

      setStep(null);
      const warnings: string[] = [];
      if (failed.length)
        warnings.push(t("admin.ai.warn.partial", { list: failed.join(", ") }));
      if (photoFlagged)
        warnings.push(t("admin.ai.warn.photos", { n: photoFlagged }));
      if (warnings.length) setWarn(warnings.join(" "));
      setPhase("done");
      // Re-seed the editor synchronously with what was actually saved, so a
      // publish click right after generation can't PUT the stale empty draft.
      if (saved)
        onDraftSaved?.({ ...saved, interactions: saveRes.interactions ?? [] });
      // The enrich + captions steps wrote photo captions/descriptions; pull them
      // into the gallery so the labels appear without a manual reload.
      onPhotosUpdated?.();
      router.refresh();
    } catch (e) {
      setStep(null);
      // A deliberate stop isn't an error — drop back to the editable state with
      // notes and answers untouched so they can adjust and run again.
      if (isAbort(e)) {
        setPhase(questions.length ? "answering" : "idle");
        return;
      }
      setError(humanError(e, t as (k: string) => string));
      setPhase(questions.length ? "answering" : "idle");
    } finally {
      abortRef.current = null;
    }
  }

  async function autoCaption() {
    setPhase("running");
    setStep(t("admin.ai.autocaption"));
    setError(null);
    setWarn(null);
    try {
      const { count } = await postJson<{ count: number }>(
        "/api/admin/ai/captions",
        { postId, lang, onlyEmpty: true },
      );
      setStep(null);
      setPhase("idle");
      setError(null);
      onPhotosUpdated?.();
      router.refresh();
      await confirm({
        message: t("admin.ai.autocaptionDone", { n: count }),
        notice: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setStep(null);
      setPhase("idle");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-sand-100/60">{t("admin.ai.subtitle")}</p>
        <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 p-0.5 text-xs">
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

      <p className="mt-3 flex items-start gap-2 rounded-xl border border-white/10 bg-ink-800/60 px-3 py-2.5 text-xs text-sand-100/70">
        <ImageUp className="mt-0.5 size-4 shrink-0 text-ember-400" />
        <span>{t("admin.ai.workflowHint")}</span>
      </p>

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => void persistNotes(notes)}
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
      {warn && <p className="mt-3 text-sm text-amber-400">{warn}</p>}
      {phase === "done" && (
        <p className="mt-3 text-sm text-sage-400">{t("admin.ai.done")}</p>
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
            {asked
              ? t("admin.ai.askMore")
              : t("admin.ai.suggestQuestions")}
          </button>
        )}
        {phase === "answering" && (
          <button
            onClick={addToContext}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-ember-400"
          >
            <ListPlus className="size-4" /> {t("admin.ai.addToContext")}
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
        {busy && (
          <button
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:border-red-400 hover:text-red-200"
          >
            <Square className="size-3.5" /> {t("admin.ai.stop")}
          </button>
        )}
        {phase !== "answering" && (
          <button
            onClick={autoCaption}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-sand-100/80 transition hover:border-ember-400 disabled:opacity-50"
          >
            <Wand2 className="size-4" /> {t("admin.ai.autocaption")}
          </button>
        )}
      </div>
    </div>
  );
}
