import { describe, it, expect } from "vitest";
import {
  onboardingSteps,
  onboardingComplete,
  type OnboardingFacts,
} from "@/lib/onboarding";

const nothing: OnboardingFacts = {
  nameSet: false,
  taglineSet: false,
  hasTrip: false,
  hasPublishedPost: false,
  aiConfigured: false,
};
const allRequired: OnboardingFacts = {
  nameSet: true,
  taglineSet: true,
  hasTrip: true,
  hasPublishedPost: true,
  aiConfigured: false,
};

const byKey = (facts: OnboardingFacts) =>
  Object.fromEntries(onboardingSteps(facts).map((s) => [s.key, s.done]));

describe("onboardingSteps", () => {
  it("offers every step, undone, on a brand-new install", () => {
    const steps = onboardingSteps(nothing);
    expect(steps.map((s) => s.key)).toEqual([
      "name",
      "tagline",
      "trip",
      "post",
      "ai",
    ]);
    expect(steps.every((s) => !s.done)).toBe(true);
  });

  it("points each step at the page that does the job", () => {
    // The AI step used to land on /admin/settings alongside name and tagline,
    // which meant "connect an AI provider" opened the branding form and left
    // the reader to find the right section. Settings is split by area now and
    // each step links to its own; the paths come from @/lib/settings-areas so
    // a section that moves takes its checklist link with it.
    const hrefs = Object.fromEntries(
      onboardingSteps(nothing).map((s) => [s.key, s.href]),
    );
    expect(hrefs).toEqual({
      name: "/admin/settings",
      tagline: "/admin/settings",
      trip: "/admin/trips/new",
      post: "/admin/posts/new",
      ai: "/admin/settings/ai",
    });
  });

  it("requires only the two things that make a journal", () => {
    // Branding used to be required, which meant the card could never retire
    // for an owner happy with the defaults: `nameSet` means "typed something",
    // and leaving it unset IS a decision. Required is now somewhere to put
    // stories, and a story.
    const required = onboardingSteps(nothing)
      .filter((s) => !s.optional)
      .map((s) => s.key);
    expect(required).toEqual(["trip", "post"]);
  });

  it("still offers branding and AI as suggestions", () => {
    const optional = onboardingSteps(nothing)
      .filter((s) => s.optional)
      .map((s) => s.key);
    expect(optional).toEqual(["name", "tagline", "ai"]);
  });

  it("retires once there is a trip and a published story", () => {
    // The behaviour the card's own doc comment promises — "renders nothing
    // once the required steps are done, so it retires itself without anyone
    // having to dismiss it" — and which the branding steps quietly prevented.
    const steps = onboardingSteps({
      ...nothing,
      hasTrip: true,
      hasPublishedPost: true,
    });
    expect(onboardingComplete(steps)).toBe(true);
  });

  it("ticks each step off its own fact", () => {
    expect(byKey({ ...nothing, nameSet: true }).name).toBe(true);
    expect(byKey({ ...nothing, taglineSet: true }).tagline).toBe(true);
    expect(byKey({ ...nothing, hasTrip: true }).trip).toBe(true);
    expect(byKey({ ...nothing, hasPublishedPost: true }).post).toBe(true);
    expect(byKey({ ...nothing, aiConfigured: true }).ai).toBe(true);
  });

  it("does not tick a step off someone else's fact", () => {
    expect(byKey({ ...nothing, hasTrip: true })).toMatchObject({
      name: false,
      tagline: false,
      post: false,
      ai: false,
    });
  });
});

describe("onboardingComplete", () => {
  it("is false while any required step is outstanding", () => {
    expect(onboardingComplete(onboardingSteps(nothing))).toBe(false);
    expect(
      onboardingComplete(onboardingSteps({ ...allRequired, hasTrip: false })),
    ).toBe(false);
  });

  it("is true once the required steps are done, even without AI", () => {
    expect(onboardingComplete(onboardingSteps(allRequired))).toBe(true);
  });

  it("stays true when the optional step is done too", () => {
    expect(
      onboardingComplete(onboardingSteps({ ...allRequired, aiConfigured: true })),
    ).toBe(true);
  });
});
