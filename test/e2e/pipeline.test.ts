// End-to-end test of the AI drafting pipeline with both external seams faked:
// a scripted DeepSeek and an in-memory Supabase. It drives the *real* route
// handlers in the same order the admin UI does, and asserts the wiring:
//   - the section route enqueues an ai_jobs row whose synchronous fallback
//     fills the markdown (the Edge path is exercised in prod, not here)
//   - an AI-authored :::poll block is materialised into the interactions table
//   - the saved body validates with no dangling references
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeFakeSupabase, type FakeSupabase } from "../helpers/fake-supabase";
import { makeFakeDeepseek } from "../helpers/fake-deepseek";
import { makeSeed } from "../helpers/seed";
import { validateBody } from "@/lib/interactions-parse";

// Holders the module mocks read at call time (set per test).
const ds = vi.hoisted(() => ({ fn: async (_o: unknown): Promise<string> => "" }));
const sb = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/ai/deepseek", async (orig) => {
  const actual = await orig<typeof import("@/lib/ai/deepseek")>();
  return { ...actual, deepseekChat: (o: unknown) => ds.fn(o) };
});
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => sb.client,
}));
// The section route enqueues an ai_jobs row via the service-role client.
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => sb.client,
}));
// Photo descriptions now go through a (separate) OpenAI-compatible vision
// provider via fetch, so enable it and point it at a stub-able endpoint.
vi.mock("@/lib/env", async (orig) => {
  const actual = await orig<typeof import("@/lib/env")>();
  return {
    ...actual,
    isVisionConfigured: true,
    // No Edge secret in tests → enqueueLlmJob runs the synchronous fallback,
    // which calls the faked deepseekChat and fills the ai_jobs row in-route.
    isEdgeJobConfigured: false,
    env: {
      ...actual.env,
      visionApiKey: "test-key",
      visionBaseUrl: "http://vision.test/v1",
      visionModel: "test-vision",
    },
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

    // 5. Save-draft materialises the :::poll into the interactions table.
    const saved = await call(saveDraft, {
      postId,
      title: o.title,
      excerpt: o.excerpt,
      location: o.location,
      cover_photo_id: o.cover_photo_id,
      body: assembled,
    });
    expect(saved.status).toBe(200);

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

  it("save-draft prunes interactions the regenerated body no longer references", async () => {
    const { postId } = setup();
    // A regenerate: one interaction is kept (referenced), one is now stale.
    store.interactions = [
      { id: "keep-1", post_id: postId, kind: "poll", question: "Stay?", options: ["a", "b"], sort_order: 0 },
      { id: "orphan-1", post_id: postId, kind: "quiz", question: "Gone?", options: ["a", "b"], sort_order: 1 },
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
