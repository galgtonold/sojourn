// eval/run.eval.ts — vitest entry for the AI eval harness.
// Run with:  EVAL_FAKE=1 npm run eval
import { expect, it, vi } from "vitest";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeFakeSupabase } from "../test/helpers/fake-supabase";
import { installFetchCache, type CacheKind } from "./harness/cache";
import { loadFixture, type LoadedFixture } from "./harness/fixture";
import { runChecks, type RunResult } from "./harness/checks";
import { writeReport, type FixtureOutcome } from "./harness/report";
import { installFakeBackend } from "./harness/fake-backend";
import { buildPacket } from "./harness/packet";
import {
  maskProtectedTokens, allMasksPresent, restoreProtectedTokens, stripWrappingCodeFence,
} from "@/lib/ai/token-mask";

// Supabase is always faked; the model is controlled at the fetch boundary below.
const sb = vi.hoisted(() => ({ client: null as unknown }));
// fake must be read inside vi.hoisted so it's available when vi.mock factories run
// (vi.mock is hoisted above all module-level code by vitest).
const { fake } = vi.hoisted(() => ({ fake: process.env.EVAL_FAKE === "1" }));
vi.mock("@/lib/supabase/server", () => ({ getServerSupabase: async () => sb.client }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminSupabase: () => sb.client }));
vi.mock("@/lib/env", async (orig) => {
  const actual = await orig<typeof import("@/lib/env")>();
  // Force the synchronous job fallback rather than the Edge Function.
  return { ...actual, isEdgeJobConfigured: false };
});
// The AI provider config: mocked because getAiConfig is an unstable_cache, which
// needs a request-scoped incremental cache the harness has no way to supply.
vi.mock("@/lib/ai-config", async () => {
  // Real runs: load .env.local BEFORE anything reads process.env, so the
  // operator's provider keys flow through readAiEnv. (Fake runs need no real
  // creds — the fake backend intercepts fetch.)
  if (!fake) await import("./harness/load-env");
  const { readAiEnv, resolveAiConfig } = await import("@/lib/ai-config-fields");
  return {
    AI_CONFIG_TAG: "ai-config",
    getAiConfig: async () =>
      fake
        ? // Fake mode: the fake backend intercepts fetch, so these are never sent.
          resolveAiConfig(
            {
              deepseekApiKey: "fake-key",
              visionApiKey: "k",
              visionBaseUrl: "https://vision.test/v1",
              visionModel: "v",
            },
            {},
          )
        : // Real mode: the operator's own env, so a cache miss reaches the
          // real provider.
          resolveAiConfig({}, readAiEnv()),
  };
});

import { POST as enrichPost } from "@/app/api/admin/ai/enrich-post/route";
import { POST as questions } from "@/app/api/admin/ai/questions/route";
import { POST as outline } from "@/app/api/admin/ai/outline/route";
import { POST as section } from "@/app/api/admin/ai/section/route";
import { POST as homogenize } from "@/app/api/admin/ai/homogenize/route";
import { POST as captions } from "@/app/api/admin/ai/captions/route";
import { POST as saveDraft } from "@/app/api/admin/ai/save-draft/route";

type Handler = (req: Request) => Promise<Response>;
async function call(h: Handler, body: unknown) {
  const res = await h(new Request("http://t/api", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  return res.json();
}
const store = () => (sb.client as ReturnType<typeof makeFakeSupabase>).store;
function jobOutput(jobId: string): string {
  return ((store().ai_jobs ?? []).find((j) => j.id === jobId)?.output as string) ?? "";
}

async function runFixture(fx: LoadedFixture): Promise<{ run: RunResult; packet: string }> {
  sb.client = makeFakeSupabase(fx.db);
  // The author's `ask` (e.g. "a quiz with 3 questions") is a generation
  // instruction — in the real app it lives in ai_notes, so fold it into the
  // notes every step sees, otherwise the pipeline never learns to honour it.
  const notes = [fx.notes, fx.ask].filter(Boolean).join("\n\n") || undefined;
  // Vision enrichment runs in batches of 4 and reports how many remain; the real
  // client loops until done, so mirror that — otherwise only the first 4 photos
  // ever get a description.
  for (let guard = 0; guard < 20; guard++) {
    const r = await call(enrichPost, { postId: fx.postId });
    if (((r?.remaining as number) ?? 0) === 0) break;
  }
  const q = await call(questions, { postId: fx.postId, notes, lang: fx.lang });
  const qa = fx.answers;
  const o = (await call(outline, { postId: fx.postId, notes, answers: qa, lang: fx.lang })).outline;

  const parts: string[] = [];
  for (let i = 0; i < o.sections.length; i++) {
    const { jobId } = await call(section, {
      postId: fx.postId, index: i, total: o.sections.length, title: o.title,
      section: o.sections[i], outline: o.sections.map((s: { heading: string; beat?: string }) => ({ heading: s.heading, beat: s.beat })),
      notes, answers: qa, lang: fx.lang,
    });
    parts.push(jobOutput(jobId));
  }
  // Homogenize exactly as the client does: mask every [photo:]/[ask:] tag to a
  // [[KEEP-n]] sentinel first, then restore the originals — otherwise the rewrite
  // mangles the tags (the route's prompt assumes a masked body). On any dropped
  // sentinel, fall back to the raw section concatenation.
  const rawBody = parts.join("\n\n");
  let body = rawBody;
  if (parts.length >= 2) {
    const { masked, tokens } = maskProtectedTokens(rawBody);
    const { jobId } = await call(homogenize, { postId: fx.postId, lang: fx.lang, body: masked });
    const out = stripWrappingCodeFence(jobOutput(jobId));
    if (out && allMasksPresent(out, tokens)) body = restoreProtectedTokens(out, tokens);
  }
  await call(captions, { postId: fx.postId, lang: fx.lang, body });
  await call(saveDraft, {
    postId: fx.postId, title: o.title, excerpt: o.excerpt, location: o.location,
    lat: o.lat, lng: o.lng, cover_photo_id: o.cover_photo_id, date: o.date, body,
  });

  const s = store();
  const interactions = (s.interactions ?? []).map((i) => ({
    id: i.id as string, kind: i.kind as "poll" | "quiz",
    options: (i.options as string[]) ?? [], correct_index: (i.correct_index as number | null) ?? null,
  }));
  const captionsOut = (s.photos ?? []).map((p) => ({ id: p.id as string, caption: (p.caption as string | null) ?? null }));
  const run: RunResult = { fixture: fx, title: (s.posts[0]?.title as string) ?? "", questions: q.questions ?? [], body: (s.posts[0]?.body as string) ?? "", interactions, captions: captionsOut };
  return { run, packet: buildPacket(fx, s) };
}

function fixtureDirs(): string[] {
  const root = join(process.cwd(), "eval/fixtures");
  const only = process.env.EVAL_FIXTURE;
  if (only) return [join(root, only)];
  const dirs = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(root, d.name)) : [];
  return dirs.length ? dirs : [join(process.cwd(), "eval/sample/sample-trip")]; // fall back to the sample
}

function refreshSet(): Set<CacheKind> | "all" {
  const v = process.env.EVAL_REFRESH;
  if (!v) return new Set();
  if (v === "all") return "all";
  return new Set(v.split(",").map((s) => s.trim()) as CacheKind[]);
}

it("runs the eval and writes a report", async () => {
  const restore = process.env.EVAL_FAKE === "1"
    ? installFakeBackend()
    : installFetchCache({ dir: join(process.cwd(), "eval/.cache"), refresh: refreshSet() });

  const outcomes: FixtureOutcome[] = [];
  const packets: { slug: string; packet: string }[] = [];
  for (const dir of fixtureDirs()) {
    const fx = loadFixture(dir);
    const { run, packet } = await runFixture(fx);
    outcomes.push({ run, checks: runChecks(run) });
    packets.push({ slug: fx.slug, packet });
  }
  restore();

  const runDir = join(process.cwd(), "eval/runs", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(join(runDir, "packets"), { recursive: true });
  const { reportPath } = writeReport(outcomes, runDir);
  // One self-contained judge packet per fixture (ground truth + generated
  // artifacts), the input for the quality/truthfulness judge subagents.
  for (const { slug, packet } of packets) {
    writeFileSync(join(runDir, "packets", `${slug}.md`), packet);
  }
  expect(existsSync(reportPath)).toBe(true);
  console.log(`\n📋 eval report: ${reportPath}\n`);
}, 600_000);
