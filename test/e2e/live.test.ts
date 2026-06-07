// Opt-in smoke test against the REAL DeepSeek API. Faked Supabase only — it
// drives outline → sections → save-draft with the real model and asserts the
// pipeline produces an internally consistent draft. Assertions stay loose
// because model output is non-deterministic.
//
// Run with:  RUN_LIVE_AI=1 DEEPSEEK_API_KEY=sk-... npm run test:ai:live
//
// Skipped by default (and if no real key is present) so `npm test` stays fast,
// free and deterministic.
import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";
import { makeSeed } from "../helpers/seed";
import { validateBody } from "@/lib/interactions-parse";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  getServerSupabase: async () => sb.client,
}));

import { POST as outline } from "@/app/api/admin/ai/outline/route";
import { POST as section } from "@/app/api/admin/ai/section/route";
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

const live =
  process.env.RUN_LIVE_AI === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== "test-key";

describe.runIf(live)("AI pipeline against real DeepSeek", () => {
  it(
    "drafts a post that validates with no dangling references",
    async () => {
      const { db, postId, photoIds } = makeSeed({ photoCount: 3 });
      const client = makeFakeSupabase(db);
      sb.client = client;

      const out = await call(outline, { postId, notes: "", answers: [], lang: "en" });
      expect(out.status).toBe(200);
      const o = out.body.outline;
      expect(o.title).toBeTruthy();
      expect(o.sections.length).toBeGreaterThan(0);

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
          lang: "en",
        });
        expect(r.status).toBe(200);
        parts.push(r.body.markdown);
      }
      const assembled = parts.join("\n\n");
      expect(assembled.length).toBeGreaterThan(50);
      expect(assembled).toContain("##");

      const saved = await call(saveDraft, {
        postId,
        title: o.title,
        excerpt: o.excerpt,
        location: o.location,
        cover_photo_id: o.cover_photo_id,
        body: assembled,
      });
      expect(saved.status).toBe(200);

      const finalBody = client.store.posts[0].body as string;
      const interactions = (client.store.interactions ?? []).map((it) => it.id as string);
      const issues = validateBody(finalBody, {
        photoIds,
        photoCount: photoIds.length,
        interactionIds: interactions,
        interactionCount: interactions.length,
      });
      const dangling = issues.filter(
        (x) => x.type === "unknown-photo" || x.type === "unknown-ask",
      );
      expect(dangling).toEqual([]);
      // Any inline poll/quiz the model wrote should have been materialised.
      expect(finalBody).not.toContain(":::poll");
      expect(finalBody).not.toContain(":::quiz");
    },
    180_000,
  );
});
