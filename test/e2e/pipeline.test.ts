// End-to-end test of the AI drafting pipeline with both external seams faked:
// a scripted DeepSeek and an in-memory Supabase. It drives the *real* route
// handlers in the same order the admin UI does, and asserts the wiring:
//   - the section route enqueues an ai_jobs row whose synchronous fallback
//     fills the markdown (the Edge path is exercised in prod, not here)
//   - an AI-authored :::poll block is materialised into the interactions table
//   - the saved body validates with no dangling references
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";
import { makeFakeDeepseek } from "../helpers/fake-deepseek";
import { makeSeed } from "../helpers/seed";
import { validateBody } from "@/lib/interactions-parse";

// Holders the module mocks read at call time (set per test).
const ds = vi.hoisted(() => ({ fn: async (_o: unknown): Promise<string> => "" }));
const sb = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/ai/deepseek", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai/deepseek")>();
  // Both model entry points share one scripted seam. deepseekJson delegates to
  // the same fake as deepseekChat (its real impl calls the module-internal
  // deepseekChat, which a mock of the export alone wouldn't intercept).
  const deepseekChat = (o: unknown) => ds.fn(o);
  return {
    ...actual,
    deepseekChat,
    deepseekJson: async (o: Record<string, unknown>) =>
      actual.parseJsonLoose(await deepseekChat({ ...o, json: true })),
  };
});
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => sb.client,
}));
// The section route enqueues an ai_jobs row via the service-role client.
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => sb.client,
}));
vi.mock("@/lib/env", async (orig) => {
  const actual = await orig<typeof import("@/lib/env")>();
  return {
    ...actual,
    // No Edge secret in tests → enqueueLlmJob runs the synchronous fallback,
    // which calls the faked deepseekChat and fills the ai_jobs row in-route.
    isEdgeJobConfigured: false,
  };
});
// Photo descriptions go through a (separate) OpenAI-compatible vision provider
// via fetch, so enable it and point it at a stub-able endpoint. Mocked rather
// than mutating env: getAiConfig is an unstable_cache, which needs a
// request-scoped incremental cache no unit test can supply.
vi.mock("@/lib/ai-config", async () => {
  const { resolveAiConfig } = await import("@/lib/ai-config-fields");
  return {
    AI_CONFIG_TAG: "ai-config",
    getAiConfig: async () =>
      resolveAiConfig(
        {
          deepseekApiKey: "test-key",
          visionApiKey: "test-key",
          visionBaseUrl: "http://vision.test/v1",
          visionModel: "test-vision",
        },
        {},
      ),
  };
});

// Imported after the mocks above are registered (vi.mock is hoisted).
import { POST as outline } from "@/app/api/admin/ai/outline/route";
import { POST as section } from "@/app/api/admin/ai/section/route";
import { POST as captions } from "@/app/api/admin/ai/captions/route";
import { POST as enrichPost } from "@/app/api/admin/ai/enrich-post/route";
import { POST as saveDraft } from "@/app/api/admin/ai/save-draft/route";

type Handler = (req: Request) => Promise<Response>;
async function call(handler: Handler, body: unknown) {
  const req = new Request("http://test/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await handler(req);
  return { status: res.status, body: await res.json() };
}

describe("AI pipeline (faked DeepSeek + Supabase)", () => {
  let fake: ReturnType<typeof makeFakeDeepseek>;
  let store: FakeSupabase["store"];

  function setup(seedOpts?: Parameters<typeof makeSeed>[0]) {
    const seed = makeSeed(seedOpts);
    const client = makeFakeSupabase(seed.db);
    store = client.store;
    sb.client = client;
    fake = makeFakeDeepseek({ photoIds: seed.photoIds });
    ds.fn = fake.chat as typeof ds.fn;
    return seed;
  }

  beforeEach(() => {
    ds.fn = async () => "";
    sb.client = null;
    // buildDossier reaches out for weather/geocoding; keep the pipeline offline.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  // A Supabase session is not a permission. These routes read nothing from the
  // database before spending money — the prompt comes straight off the request
  // — so there is no query for RLS to filter and no second line of defence.
  // Until 0043 that meant anyone holding any session could bill 32,000-token
  // generations to the operator's provider key, and Supabase handed sessions to
  // anyone who asked for one.
  describe("a session without a profile", () => {
    it("cannot reach an AI route", async () => {
      const seed = makeSeed();
      seed.db.profiles = [];
      const client = makeFakeSupabase(seed.db);
      sb.client = client;
      ds.fn = makeFakeDeepseek({ photoIds: seed.photoIds }).chat as typeof ds.fn;

      const res = await call(outline, { postId: seed.postId, lang: "de" });
      expect(res.status).toBe(403);
    });

    it("is refused before the model is ever called", async () => {
      // The point is the bill, not the status code: a 403 that still ran the
      // generation would have fixed nothing.
      const seed = makeSeed();
      seed.db.profiles = [];
      sb.client = makeFakeSupabase(seed.db);
      const spy = makeFakeDeepseek({ photoIds: seed.photoIds });
      ds.fn = spy.chat as typeof ds.fn;

      await call(outline, { postId: seed.postId, lang: "de" });
      expect(spy.calls.length).toBe(0);
    });
  });

  it("runs outline → sections → captions → save-draft and materialises a poll", async () => {
    const { postId, photoIds } = setup();

    // 1. Enrichment: photos are pre-enriched, so the loop finishes immediately.
    const enriched = await call(enrichPost, { postId });
    expect(enriched.body.remaining).toBe(0);

    // 2. Outline — one section is nominated to carry a poll.
    const out = await call(outline, { postId, notes: "", answers: [], lang: "de" });
    expect(out.status).toBe(200);
    const o = out.body.outline;
    expect(o.sections).toHaveLength(2);
    expect(o.sections[0].interaction?.kind).toBe("poll");

    // 3. Sections — each is enqueued as a job; the synchronous fallback fills
    //    the row in-route, so we read the markdown straight back from it.
    const parts: string[] = [];
    for (let i = 0; i < o.sections.length; i++) {
      const r = await call(section, {
        postId,
        index: i,
        total: o.sections.length,
        title: o.title,
        section: o.sections[i],
        notes: "",
        answers: [],
        lang: "de",
      });
      expect(r.status).toBe(200);
      const job = (store.ai_jobs ?? []).find((j) => j.id === r.body.jobId);
      parts.push((job?.output as string) ?? "");
    }
    const assembled = parts.join("\n\n");

    // One model call per section (no in-route repair loop any more).
    expect(fake.calls.filter((c) => c.operation === "section")).toHaveLength(2);
    // The body uses a real photo, not the bogus placeholder id.
    expect(assembled).not.toContain("00000000-0000-0000-0000-000000000000");
    expect(assembled).toContain(`[photo:${photoIds[0]}]`);
    // The AI authored an inline poll (still litter at this point).
    expect(assembled).toContain(":::poll");

    // 4. Captions for the enriched photos.
    const caps = await call(captions, { postId, lang: "de" });
    expect(caps.body.count).toBe(photoIds.length);

    // Location/coords come from the data (photo centroid here), date from the
    // earliest photo — not the model's guess.
    expect(o.location).toBe("Berner Oberland"); // author's typed location wins
    expect(o.lat).not.toBeNull();
    expect(o.date).toBe("2026-06-01");

    // 5. Save-draft materialises the :::poll into the interactions table.
    const saved = await call(saveDraft, {
      postId,
      title: o.title,
      excerpt: o.excerpt,
      location: o.location,
      lat: o.lat,
      lng: o.lng,
      cover_photo_id: o.cover_photo_id,
      date: o.date,
      body: assembled,
    });
    expect(saved.status).toBe(200);
    expect(store.posts[0].published_at).toContain("2026-06-01"); // dated from photos

    const interactions = store.interactions;
    expect(interactions).toHaveLength(1);
    expect(interactions[0].kind).toBe("poll");
    expect(interactions[0].options).toEqual(["Gemmipass", "Furkapass"]);

    const finalBody = store.posts[0].body as string;
    expect(finalBody).not.toContain(":::poll");
    expect(finalBody).toContain(`[ask:${interactions[0].id}]`);

    // The saved body is internally consistent — no dangling references.
    const issues = validateBody(finalBody, {
      photoIds,
      photoCount: photoIds.length,
      interactionIds: interactions.map((it) => it.id as string),
      interactionCount: interactions.length,
    });
    expect(issues).toEqual([]);
  });

  it("save-draft prunes AI interactions the regenerated body no longer references", async () => {
    const { postId } = setup();
    // A regenerate: one AI interaction is kept (referenced), one is now stale.
    store.interactions = [
      { id: "keep-1", post_id: postId, kind: "poll", question: "Stay?", options: ["a", "b"], sort_order: 0, source: "ai" },
      { id: "orphan-1", post_id: postId, kind: "quiz", question: "Gone?", options: ["a", "b"], sort_order: 1, source: "ai" },
    ];

    const r = await call(saveDraft, {
      postId,
      title: "Regenerated",
      body: "Neuer Text.\n\n[ask:keep-1]\n\nSchluss.",
    });
    expect(r.status).toBe(200);

    const ids = store.interactions.map((it) => it.id);
    expect(ids).toContain("keep-1");
    expect(ids).not.toContain("orphan-1");
  });

  it("save-draft never drops an author-defined interaction, appending it if unplaced", async () => {
    const { postId } = setup();
    // The author defined a poll; a regenerate produced a body that forgot it.
    store.interactions = [
      { id: "mine-1", post_id: postId, kind: "poll", question: "Mine?", options: ["a", "b"], sort_order: 0, source: "author" },
    ];

    const r = await call(saveDraft, {
      postId,
      title: "Regenerated",
      body: "Neuer Text ohne Verweis.\n\nSchluss.",
    });
    expect(r.status).toBe(200);

    // Preserved (not pruned) and woven back into the body via its [ask:] tag.
    const ids = store.interactions.map((it) => it.id);
    expect(ids).toContain("mine-1");
    expect(store.posts[0].body as string).toContain("[ask:mine-1]");
  });

  it("enriches a pending photo via the description path (no geocoding)", async () => {
    const { postId } = setup({ photoCount: 1, enriched: false, pending: true });

    // The description path calls the OpenAI-compatible vision endpoint.
    const visionFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "Eine weite Berglandschaft im Morgenlicht.",
                },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 20 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", visionFetch);

    const r = await call(enrichPost, { postId });

    vi.unstubAllGlobals();

    expect(r.status).toBe(200);
    expect(r.body.processed).toBe(1);
    // The vision provider was hit (model + image content part).
    expect(visionFetch).toHaveBeenCalledWith(
      "http://vision.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" }),
    );

    const photo = store.photos[0];
    expect(photo.ai_description).toBe("Eine weite Berglandschaft im Morgenlicht.");
    expect(photo.enriched_at).not.toBeNull();
  });

  it("rejects unauthenticated requests", async () => {
    setup();
    sb.client = { ...(sb.client as object), auth: { getUser: async () => ({ data: { user: null } }) } };
    const r = await call(outline, { postId: makeSeed().postId, lang: "de" });
    expect(r.status).toBe(401);
  });
});
