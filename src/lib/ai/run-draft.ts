// Framework-free orchestration of the AI draft pipeline:
//   enrich → caption DRAFT → trip brief → outline → per-section
//   (enqueue → poll → photo-ref repair) → homogenize → caption POLISH → save.
//
// Lifted out of the React panel (ADR-0001 keeps it CLIENT-run — this changes
// nothing about that) so the *sequence and its branch conditions* — which the
// panel could only express through React state and which no test could reach —
// become a plain async function over injected effects. The panel supplies
// fetch/poll/retry + progress callbacks; here we own only the ordering.
import type { Outline } from "@/lib/ai/outline-plan";
import type { ManagedInteraction } from "@/components/interaction-manager";
import type { DraftSaved } from "@/components/ai-draft-panel";
import { invalidPhotoRefs } from "@/lib/photo-refs";
import { homogenizeWithMasking } from "@/lib/ai/token-mask";

export type DraftStepKey =
  | "enrich"
  | "captionDraft"
  | "brief"
  | "outline"
  | "section"
  | "homogenize"
  | "captions"
  | "save";

export type RunDraftDeps = {
  postJson: <T>(url: string, body: unknown, signal?: AbortSignal) => Promise<T>;
  pollJob: (jobId: string, signal?: AbortSignal) => Promise<string>;
  withRetry: <T>(fn: () => Promise<T>) => Promise<T>;
  isAbort: (e: unknown) => boolean;
  signal: AbortSignal;
  // Progress, kept i18n-free: the panel maps the step key (+ optional a/b for the
  // "section a/b" label) to a localized label and to the section checklist.
  onStep: (key: DraftStepKey, progress: number, vars?: { a?: number; b?: number }) => void;
  onSections: (s: { done: number; total: number }) => void;
  // The outline route persists the notes; the panel uses this to keep autosave
  // quiet during the long section phase.
  onNotesPersisted?: () => void;
};

export type RunDraftInput = {
  postId: string;
  lang: string;
  notes: string;
  qa: { question: string; answer: string }[];
  captionsOnlyEmpty: boolean;
};

// Structured outcome so the panel — not this module — decides the copy.
export type DraftWarnings = {
  failedSections: number[]; // 1-based indices skipped after retries
  photoFlagged: number; // sections that still cite an unknown photo id
  homogenizeFellBack: boolean; // polish discarded → raw concatenation shipped
  captionsFailed: boolean;
};

export type DraftResult = {
  saved: Omit<DraftSaved, "interactions"> | null;
  interactions: ManagedInteraction[];
  warnings: DraftWarnings;
};

/** Every section failed, so there is no prose to save. The panel maps this to a
 *  friendly message; distinct so tests can assert it. */
export class NoSectionsError extends Error {
  constructor() {
    super("no-sections");
    this.name = "NoSectionsError";
  }
}

export async function runDraft(
  deps: RunDraftDeps,
  input: RunDraftInput,
): Promise<DraftResult> {
  const { postJson, pollJob, withRetry, isAbort, signal, onStep, onSections } = deps;
  const { postId, lang, notes, qa, captionsOnlyEmpty } = input;

  // 1. Enrich photos in batches until none remain (best effort — captions can be
  //    filled later, so a hiccup here shouldn't block the draft).
  onStep("enrich", 0.03);
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

  // 1b. Caption DRAFT (best effort): caption every eligible photo now, so the
  //     article is written knowing each image's caption and can complement it.
  onStep("captionDraft", 0.1);
  let draftedIds: string[] = [];
  let draftFailed = false;
  try {
    const r = await postJson<{ ids: string[] }>(
      "/api/admin/ai/captions",
      { postId, lang, phase: "draft", onlyEmpty: captionsOnlyEmpty },
      signal,
    );
    draftedIds = r.ids ?? [];
  } catch (e) {
    if (isAbort(e)) throw e;
    draftFailed = true;
  }

  // 1c. Trip continuity brief (best effort): distil the trip's earlier days,
  //     threaded into the outline + every section prompt.
  onStep("brief", 0.13);
  let brief = "";
  try {
    const r = await postJson<{ brief: string }>(
      "/api/admin/ai/trip-brief",
      { postId },
      signal,
    );
    brief = r.brief ?? "";
  } catch (e) {
    if (isAbort(e)) throw e;
    /* best effort — proceed without a brief */
  }

  // 2. Outline (retried — a usable plan is the backbone of the whole draft).
  onStep("outline", 0.16);
  const { outline } = await withRetry(() =>
    postJson<{ outline: Outline }>(
      "/api/admin/ai/outline",
      { postId, notes, answers: qa, lang, brief },
      signal,
    ),
  );
  deps.onNotesPersisted?.();

  // 3. Write each section (retried independently). A section that keeps failing
  //    is skipped rather than sinking the run, so the draft still captures
  //    everything that did write.
  const parts: string[] = [];
  const failedSections: number[] = [];
  let photoFlagged = 0;
  const total = outline.sections.length;
  for (let i = 0; i < total; i++) {
    onStep("section", 0.24 + 0.5 * (i / total), { a: i + 1, b: total });
    onSections({ done: i, total });
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
        outline: outline.sections.map((s) => ({ heading: s.heading, beat: s.beat })),
        notes,
        answers: qa,
        lang,
        brief,
      };
      const { jobId } = await withRetry(() =>
        postJson<{ jobId: string }>("/api/admin/ai/section", req, signal),
      );
      let markdown = await pollJob(jobId, signal);

      // If the model invented photo ids, feed them back for one repair pass.
      let invalid = invalidPhotoRefs(markdown, allowed);
      if (invalid.length) {
        try {
          const { jobId: repairId } = await withRetry(() =>
            postJson<{ jobId: string }>(
              "/api/admin/ai/section",
              { ...req, avoidPhotoIds: invalid },
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
      if (invalid.length) photoFlagged += 1;
      if (markdown) parts.push(markdown);
    } catch (e) {
      if (isAbort(e)) throw e; // a stop ends the whole run, not just a section
      failedSections.push(i + 1);
    }
  }

  if (parts.length === 0) throw new NoSectionsError();
  onSections({ done: total, total });

  // 4. Homogenize: stitch the sections into one article. The mask → call →
  //    verify → restore-or-fallback safety lives in homogenizeWithMasking; here
  //    we only supply the model call.
  const rawBody = parts.join("\n\n");
  let body = rawBody;
  let homogenizeFellBack = false;
  if (parts.length >= 2) {
    onStep("homogenize", 0.8);
    const res = await homogenizeWithMasking(
      rawBody,
      async (masked) => {
        const { jobId } = await postJson<{ jobId: string }>(
          "/api/admin/ai/homogenize",
          { postId, lang, body: masked },
          signal,
        );
        return pollJob(jobId, signal);
      },
      { rethrowIf: isAbort },
    );
    body = res.body;
    homogenizeFellBack = res.fellBack;
  }

  // 5. Caption POLISH (best effort): refine each drafted caption to the article's
  //    voice. Target the drafted ids; if the draft failed, do one full pass.
  onStep("captions", 0.9);
  let captionsFailed = draftFailed;
  const shouldPolish = draftFailed || draftedIds.length > 0;
  if (shouldPolish) {
    await postJson(
      "/api/admin/ai/captions",
      {
        postId,
        lang,
        phase: "polish",
        body,
        onlyEmpty: captionsOnlyEmpty,
        ...(draftFailed ? {} : { photoIds: draftedIds }),
      },
      signal,
    ).catch((e) => {
      if (!isAbort(e)) captionsFailed = true;
    });
  }

  // 6. Save the assembled draft (retried — never lose finished prose).
  onStep("save", 0.97);
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
        outline,
        homogenizeFellBack,
      },
      signal,
    ),
  );

  return {
    saved: saveRes.post,
    interactions: saveRes.interactions ?? [],
    warnings: { failedSections, photoFlagged, homogenizeFellBack, captionsFailed },
  };
}
