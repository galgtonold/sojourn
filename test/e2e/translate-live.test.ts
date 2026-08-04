// Opt-in smoke test of the in-process translator against the REAL DeepSeek API.
// Faked Supabase — this is about whether the prompts come back usable and the
// right columns get written, not about the database.
//
// Run with:
//   RUN_LIVE_AI=1 DEEPSEEK_API_KEY=sk-... npx vitest run test/e2e/translate-live.test.ts
//
// Skipped by default so `npm test` stays fast, free and deterministic.
//
// Worth having because the failure it guards against is invisible: this path
// replaced an Edge Function nobody could run locally, and the bug it replaced
// was a silent `return`. "It compiles and the contract test passes" is exactly
// what was true while translation had not run for five weeks.
import { describe, it, expect, vi } from "vitest";
import { makeFakeSupabase } from "../helpers/fake-supabase";
import { makeSeed } from "../helpers/seed";

const sb = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminSupabase: () => sb.client,
}));
// `unstable_cache` is passed through rather than spread from the real module:
// getAiConfig is one, and it needs a request-scoped incremental cache that no
// test can supply. Same treatment as ai-settings-route.test.ts.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: unknown) => fn,
}));

import { runPostTranslation } from "@/lib/ai/translate-run";

type PostRow = {
  id: string;
  title: string;
  excerpt: string | null;
  location: string | null;
  body: string;
  slug: string;
  source_locale?: string;
  translation_status?: string;
  translation_error?: string | null;
  i18n?: { en?: { title: string; body: string } };
};
type PhotoRow = { id: string; caption: string | null; i18n?: { en?: { caption?: string } } };

/** The fake's rows are untyped bags; name the shape at the point of use. */
function rowById<T>(rows: unknown[], id: string): T {
  return (rows as { id: string }[]).find((r) => r.id === id) as T;
}

const live =
  process.env.RUN_LIVE_AI === "1" &&
  !!process.env.DEEPSEEK_API_KEY &&
  process.env.DEEPSEEK_API_KEY !== "test-key";

describe.runIf(live)("in-process translation against real DeepSeek", () => {
  it(
    "translates a German post into English and fills every i18n column",
    async () => {
      const { db, postId, photoIds } = makeSeed({ photoCount: 2 });

      const post = rowById<PostRow>(db.posts, postId);
      post.title = "Vom Wasserschloss in die Binghöhle";
      post.excerpt = "Ein kurzer Tag durch die Fränkische Schweiz.";
      post.location = "Fränkische Schweiz, Deutschland";
      post.body =
        "## Der Aufstieg\n\nWir sind früh los, der Weg war schmal und noch nass vom Regen.\n\n" +
        `[photo:${photoIds[0]}]\n\nDrinnen war es kühl und still.\n`;
      post.slug = "vom-wasserschloss";
      for (const p of db.photos as PhotoRow[]) p.caption = "Blick vom Turm auf das Tal";

      // NB: makeFakeSupabase deep-clones the seed, so the runner's writes land
      // in `client.store` — reading `db` back shows only what we put there.
      const client = makeFakeSupabase(db);
      sb.client = client;
      await runPostTranslation(postId);

      const after = rowById<PostRow>(client.store.posts, postId);
      expect(after.translation_status, after.translation_error ?? "").toBe("ready");
      expect(after.source_locale).toBe("de");

      const en = after.i18n?.en;
      expect(en, "no English payload written").toBeTruthy();
      // Loose on wording — model output is not deterministic — strict on the
      // things a reader would notice immediately.
      expect(en?.title).toBeTruthy();
      expect(en?.title).not.toBe(post.title);

      // The photo token is how the picture stays attached to its paragraph.
      // Lose it in translation and the English article silently drops the image.
      expect(en?.body, "photo token did not survive").toContain(
        `[photo:${photoIds[0]}]`,
      );
      // Markdown structure has to survive too, or the heading becomes prose.
      expect(en?.body).toMatch(/^##\s/m);

      // Captions live on their own rows, and were the half that went missing
      // when the proofreader's prompt drifted — the same shape of bug.
      const photos = client.store.photos as PhotoRow[];
      const captioned = photos.filter((p) => p.i18n?.en?.caption);
      expect(captioned.length, "no photo captions translated").toBe(photos.length);
    },
    180_000,
  );
});
