import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  bodySystemPrompt,
  detectLocale,
  otherLocale,
  pathsFor,
  shortSystemPrompt,
  tripSystemPrompt,
} from "@/lib/ai/translate-prompts";

// Translation now runs in two places: the `translate` Edge Function on Supabase,
// and in-process for deployments that have no Edge Function — which is every
// self-hosted one, because that function exists only to dodge a serverless
// timeout a VPS does not have.
//
// Two runtimes asking a model for different things is not a compile error and
// not a runtime error. It shows up as a reader seeing one field translated and
// another not, months later. The same shape of gap already bit the proofreader,
// where the prompt and the validator drifted and every caption finding was
// silently dropped — see proofread-contract.test.ts, which this mirrors.
//
// So the prompts live in one module and this reads the Edge Function's actual
// source to prove it still asks for the same thing.

const EDGE = readFileSync("supabase/functions/translate/index.ts", "utf8");

describe("the Edge Function and the in-process runner ask for the same thing", () => {
  it("uses the same body-translation instructions", () => {
    // The clause that matters most: the tokens are how photos and questions
    // stay attached to the right paragraph. A translation that drops them
    // silently unlinks every photo in the post.
    expect(EDGE).toContain(
      "Preserve EXACTLY and in place every token of the form [photo:...] and [ask:...].",
    );
    expect(bodySystemPrompt("de", "en")).toContain(
      "Preserve EXACTLY and in place every token of the form [photo:...] and [ask:...].",
    );
  });

  it("names the same fields in the short-fields prompt", () => {
    const clause =
      "Translate: title, excerpt, location, every interaction's question/options/explanation, every photo's caption.";
    expect(EDGE).toContain(clause);
    expect(shortSystemPrompt("de", "en")).toContain(clause);
  });

  it("keeps the same place-name rule, which is the fiddly one", () => {
    const clause =
      "but render country and region names in the target language (e.g. Norway→Norwegen, Sweden→Schweden, Italy→Italien).";
    expect(EDGE).toContain(clause);
    expect(shortSystemPrompt("de", "en")).toContain(clause);
  });

  it("asks for the same trip shape", () => {
    const clause =
      'Return ONLY a JSON object {"title":string,"summary":string|null}.';
    expect(EDGE).toContain(clause);
    expect(tripSystemPrompt("en", "de")).toContain(clause);
  });

  it("names the languages the same way round", () => {
    // `LANG[source]` then `LANG[target]`. Swapped, the model is asked to
    // translate English into English and returns the input unchanged — which
    // looks like a working translation right up until someone reads it.
    expect(bodySystemPrompt("de", "en")).toContain("from German to English");
    expect(bodySystemPrompt("en", "de")).toContain("from English to German");
    expect(EDGE).toContain("from ${LANG[source]} to ${LANG[target]}");
  });

  it("shares the language-detection word lists", () => {
    // Different lists mean the two runtimes disagree about which way to
    // translate the same post.
    for (const w of ["der", "und", "nicht", "durch"]) {
      expect(EDGE, `edge lost the German word ${w}`).toContain(`"${w}"`);
    }
    for (const w of ["the", "were", "there"]) {
      expect(EDGE, `edge lost the English word ${w}`).toContain(`"${w}"`);
    }
  });
});

describe("detectLocale", () => {
  it("reads German prose as German", () => {
    expect(
      detectLocale("Der Weg war schmal und wir sind durch den Nebel gestiegen"),
    ).toBe("de");
  });

  it("reads English prose as English", () => {
    expect(
      detectLocale("The path was narrow and we climbed through the fog for hours"),
    ).toBe("en");
  });

  it("counts umlauts towards German, for a sentence with few function words", () => {
    expect(detectLocale("Frühstück am Wasserschloss")).toBe("de");
  });

  it("falls to German when there is nothing to go on", () => {
    // The default authoring language. Translating German into German wastes a
    // call; rendering it as pidgin English is published to readers.
    expect(detectLocale("")).toBe("de");
    expect(detectLocale("Hokkaido 2024")).toBe("de");
  });
});

describe("otherLocale", () => {
  it("is total, because the site is bilingual", () => {
    expect(otherLocale("de")).toBe("en");
    expect(otherLocale("en")).toBe("de");
  });
});

describe("pathsFor", () => {
  it("rebuilds the indexes as well as the entity's own page", () => {
    // Every index carries titles and excerpts, so a translation changes more
    // than the post it belongs to.
    const paths = pathsFor("post", "vom-wasserschloss");
    expect(paths).toContain("/posts/vom-wasserschloss");
    for (const p of ["/", "/posts", "/photos", "/map", "/trips"]) {
      expect(paths).toContain(p);
    }
  });

  it("points a trip at its own page, not at /posts/", () => {
    expect(pathsFor("trip", "hokkaido-winter")).toContain("/trips/hokkaido-winter");
    expect(pathsFor("trip", "hokkaido-winter")).not.toContain(
      "/posts/hokkaido-winter",
    );
  });

  it("still rebuilds the indexes when there is no slug", () => {
    expect(pathsFor("post", null)).toContain("/posts");
    expect(pathsFor("post", null).some((p) => p.endsWith("/null"))).toBe(false);
  });
});

describe("translation no longer depends on the Edge Function existing", () => {
  const TRIGGER = readFileSync("src/lib/ai/translate.ts", "utf8");

  it("does not bail out when the Edge Function is unconfigured", () => {
    // The bug: both entry points opened with this line, so a deployment without
    // a Deno runtime got no translation, no error and no log — for five weeks
    // on the author's own machine, unnoticed.
    expect(TRIGGER).not.toMatch(/if \(!isEdgeTranslateConfigured\) return;/);
  });

  it("falls back to running it in-process", () => {
    expect(TRIGGER).toContain("runPostTranslation");
    expect(TRIGGER).toContain("runTripTranslation");
  });

  it("still prefers the Edge Function when there is one", () => {
    // Existing deployments must not change behaviour: the whole point of that
    // function is keeping a long translation off the request clock.
    expect(TRIGGER).toMatch(/if \(isEdgeTranslateConfigured\) return fireEdge/);
  });
});
