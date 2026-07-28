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
    const hrefs = Object.fromEntries(
      onboardingSteps(nothing).map((s) => [s.key, s.href]),
    );
    expect(hrefs).toEqual({
      name: "/admin/settings",
      tagline: "/admin/settings",
      trip: "/admin/trips/new",
      post: "/admin/posts/new",
      ai: "/admin/settings",
    });
  });

  it("marks only AI as optional", () => {
    const optional = onboardingSteps(nothing)
      .filter((s) => s.optional)
      .map((s) => s.key);
    expect(optional).toEqual(["ai"]);
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
