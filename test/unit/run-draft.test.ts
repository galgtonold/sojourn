import { describe, it, expect, vi } from "vitest";
import { runDraft, NoSectionsError, type RunDraftDeps } from "@/lib/ai/run-draft";

const OUTLINE = {
  title: "T",
  excerpt: "E",
  location: null,
  lat: null,
  lng: null,
  cover_photo_id: null,
  sections: [
    { heading: "H0", beat: "b0", photo_ids: [], interaction_refs: ["ix1"] },
    { heading: "H1", beat: "b1", photo_ids: [] },
  ],
};
const SAVED_POST = {
  title: "T",
  excerpt: "E",
  body: "Homogenized",
  location: null,
  lat: null,
  lng: null,
  cover_image: null,
  published_at: null,
};

const INPUT = { postId: "p1", lang: "de", notes: "n", qa: [], captionsOnlyEmpty: false };

// A scripted postJson/pollJob. `onPost` may override a response or throw per call.
function makeDeps(onPost?: (url: string, body: any) => unknown) {
  const calls: { url: string; body: any }[] = [];
  const postJson = (async (url: string, body: any) => {
    calls.push({ url, body });
    const custom = onPost?.(url, body);
    if (custom !== undefined) return custom;
    if (url === "/api/admin/ai/enrich-post") return { remaining: 0 };
    if (url === "/api/admin/ai/trip-brief") return { brief: "" };
    if (url === "/api/admin/ai/captions")
      return body.phase === "draft" ? { ids: ["p1"] } : {};
    if (url === "/api/admin/ai/outline") return { outline: OUTLINE };
    if (url === "/api/admin/ai/section")
      return { jobId: `section-${body.index}` };
    if (url === "/api/admin/ai/homogenize") return { jobId: "homog" };
    if (url === "/api/admin/ai/save-draft")
      return { ok: true, post: SAVED_POST, interactions: [{ id: "ix1" }] };
    throw new Error("unexpected url " + url);
  }) as RunDraftDeps["postJson"];
  const pollJob = async (jobId: string) =>
    jobId === "homog" ? "Homogenized" : `Prose ${jobId}`;
  const deps: RunDraftDeps = {
    postJson,
    pollJob,
    withRetry: (fn) => fn(),
    isAbort: () => false,
    signal: new AbortController().signal,
    onStep: vi.fn(),
    onSections: vi.fn(),
    onNotesPersisted: vi.fn(),
  };
  return { deps, calls };
}

const urls = (calls: { url: string }[]) => calls.map((c) => c.url);

describe("runDraft", () => {
  it("runs the full pipeline in order and returns the saved draft", async () => {
    const { deps, calls } = makeDeps();
    const result = await runDraft(deps, INPUT);

    expect(urls(calls)).toEqual([
      "/api/admin/ai/enrich-post",
      "/api/admin/ai/captions", // draft
      "/api/admin/ai/trip-brief",
      "/api/admin/ai/outline",
      "/api/admin/ai/section",
      "/api/admin/ai/section",
      "/api/admin/ai/homogenize",
      "/api/admin/ai/captions", // polish
      "/api/admin/ai/save-draft",
    ]);
    expect(result.saved).toEqual(SAVED_POST);
    expect(result.interactions).toEqual([{ id: "ix1" }]);
    expect(result.warnings).toEqual({
      failedSections: [],
      photoFlagged: 0,
      homogenizeFellBack: false,
      captionsFailed: false,
    });
    expect(deps.onNotesPersisted).toHaveBeenCalledTimes(1);
    // Progress emitted in step order (i18n-free keys).
    const stepKeys = (deps.onStep as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(stepKeys).toEqual([
      "enrich",
      "captionDraft",
      "brief",
      "outline",
      "section",
      "section",
      "homogenize",
      "captions",
      "save",
    ]);
  });

  it("threads the author interaction (interaction_refs) into save-draft (#8)", async () => {
    const { deps, calls } = makeDeps();
    await runDraft(deps, INPUT);
    const save = calls.find((c) => c.url === "/api/admin/ai/save-draft")!;
    expect(save.body.outline.sections[0].interaction_refs).toEqual(["ix1"]);
  });

  it("skips a persistently-failing section and flags it, saving the rest", async () => {
    const { deps, calls } = makeDeps((url, body) => {
      if (url === "/api/admin/ai/section" && body.index === 1)
        throw new Error("section boom");
      return undefined;
    });
    const result = await runDraft(deps, INPUT);
    expect(result.warnings.failedSections).toEqual([2]); // 1-based
    // Only one section survived → homogenize skipped.
    expect(urls(calls)).not.toContain("/api/admin/ai/homogenize");
    expect(result.saved).toEqual(SAVED_POST);
  });

  it("throws NoSectionsError when every section fails", async () => {
    const { deps } = makeDeps((url) => {
      if (url === "/api/admin/ai/section") throw new Error("boom");
      return undefined;
    });
    await expect(runDraft(deps, INPUT)).rejects.toBeInstanceOf(NoSectionsError);
  });

  it("on a failed caption draft, polishes with no photoIds and flags captions", async () => {
    const { deps, calls } = makeDeps((url, body) => {
      if (url === "/api/admin/ai/captions" && body.phase === "draft")
        throw new Error("draft boom");
      return undefined;
    });
    const result = await runDraft(deps, INPUT);
    const polish = calls.find(
      (c) => c.url === "/api/admin/ai/captions" && c.body.phase === "polish",
    )!;
    expect(polish.body.photoIds).toBeUndefined(); // full pass, no target ids
    expect(result.warnings.captionsFailed).toBe(true);
  });
});
