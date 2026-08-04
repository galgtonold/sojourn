import { describe, it, expect } from "vitest";
import {
  materializeInteractions,
  stripIncompleteDirectives,
} from "@/lib/ai/materialize";
import { makeFakeSupabase, type Row } from "../helpers/fake-supabase";

// materializeInteractions takes a SupabaseClient; the in-memory fake covers the
// exact calls it makes (select sort_order / insert … select id).
const asClient = (c: ReturnType<typeof makeFakeSupabase>) => c as any;

describe("materializeInteractions", () => {
  it("inserts well-formed blocks and rewrites them to [ask:id]", async () => {
    const client = makeFakeSupabase({ interactions: [] });
    const body =
      "Intro.\n\n:::poll Which pass first?\n- Gemmi\n- Furka\n:::\n\nOutro.";
    const { body: out, created } = await materializeInteractions(
      asClient(client),
      "post-1",
      body,
    );

    expect(created).toBe(1);
    const rows = client.store.interactions as Row[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      post_id: "post-1",
      kind: "poll",
      options: ["Gemmi", "Furka"],
      sort_order: 0,
    });
    expect(out).toContain(`[ask:${rows[0].id}]`);
    expect(out).not.toContain(":::poll");
    expect(out).toContain("Intro.");
    expect(out).toContain("Outro.");
  });

  it("captures the quiz correct index and explanation", async () => {
    const client = makeFakeSupabase({ interactions: [] });
    await materializeInteractions(
      asClient(client),
      "p",
      ":::quiz How high?\n- 3000\n- = 4158\n- 5000\n> It is 4158 m.\n:::",
    );
    expect(client.store.interactions[0]).toMatchObject({
      kind: "quiz",
      correct_index: 1,
      explanation: "It is 4158 m.",
    });
  });

  it("leaves malformed blocks in place and only materializes valid ones", async () => {
    const client = makeFakeSupabase({ interactions: [] });
    const body =
      ":::poll Good\n- a\n- b\n:::\n\n:::quiz Bad (no correct)\n- a\n- b\n:::";
    const { body: out, created } = await materializeInteractions(
      asClient(client),
      "p",
      body,
    );
    expect(created).toBe(1);
    expect(out).toContain("[ask:");
    expect(out).toContain(":::quiz Bad (no correct)"); // untouched
  });

  it("continues sort_order after existing interactions", async () => {
    const client = makeFakeSupabase({
      interactions: [{ id: "x", post_id: "p", kind: "poll", sort_order: 4 }],
    });
    await materializeInteractions(
      asClient(client),
      "p",
      ":::poll Q\n- a\n- b\n:::",
    );
    const created = (client.store.interactions as Row[]).find((r) => r.id !== "x");
    expect(created?.sort_order).toBe(5);
  });

  it("is a no-op when there are no inline blocks", async () => {
    const client = makeFakeSupabase({ interactions: [] });
    const { body, created } = await materializeInteractions(
      asClient(client),
      "p",
      "Just prose with an [ask:existing-id] reference.",
    );
    expect(created).toBe(0);
    expect(body).toBe("Just prose with an [ask:existing-id] reference.");
  });
});

describe("stripIncompleteDirectives", () => {
  it("drops a bare, truncated :::poll left at the end", () => {
    expect(stripIncompleteDirectives("Schluss des Artikels.\n\n:::poll")).toBe(
      "Schluss des Artikels.",
    );
  });

  it("drops a partially-written block (opener + a line, no close)", () => {
    expect(
      stripIncompleteDirectives("Text.\n\n:::quiz Wie hoch?\n- 4158 m"),
    ).toBe("Text.");
  });

  it("keeps a following section when the broken block is mid-body", () => {
    const out = stripIncompleteDirectives(
      "## Eins\n\nText.\n\n:::poll\n\n## Zwei\n\nMehr Text.",
    );
    expect(out).not.toContain(":::poll");
    expect(out).toContain("## Eins");
    expect(out).toContain("## Zwei");
    expect(out).toContain("Mehr Text.");
  });

  it("leaves prose with no directive untouched", () => {
    const body = "## Titel\n\nNur Prosa, kein Block.";
    expect(stripIncompleteDirectives(body)).toBe(body);
  });
});
