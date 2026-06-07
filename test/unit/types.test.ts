import { describe, it, expect } from "vitest";
import {
  emptyReactions,
  REACTION_KINDS,
  REACTION_EMOJI,
} from "@/lib/types";

describe("reactions", () => {
  it("emptyReactions starts every kind at zero", () => {
    expect(emptyReactions()).toEqual({ heart: 0, fire: 0, wow: 0, star: 0 });
  });
  it("returns a fresh object each call", () => {
    const a = emptyReactions();
    a.heart = 3;
    expect(emptyReactions().heart).toBe(0);
  });
  it("has an emoji for every reaction kind", () => {
    for (const k of REACTION_KINDS) expect(REACTION_EMOJI[k]).toBeTruthy();
    expect(REACTION_KINDS).toHaveLength(4);
  });
});
