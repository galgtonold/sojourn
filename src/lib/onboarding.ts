// What a freshly claimed install still has to do, derived entirely from what is
// already in the database — there is no "onboarding progress" to store, so this
// is always right, including for installs that predate the checklist.

export type OnboardingFacts = {
  nameSet: boolean;
  taglineSet: boolean;
  hasTrip: boolean;
  hasPublishedPost: boolean;
  aiConfigured: boolean;
};

export type OnboardingKey = "name" | "tagline" | "trip" | "post" | "ai";

export type OnboardingStep = {
  key: OnboardingKey;
  done: boolean;
  /** Never blocks completion: an install with no AI key is finished, not unfinished. */
  optional: boolean;
  href: string;
};

export function onboardingSteps(facts: OnboardingFacts): OnboardingStep[] {
  return [
    { key: "name", done: facts.nameSet, optional: false, href: "/admin/settings" },
    {
      key: "tagline",
      done: facts.taglineSet,
      optional: false,
      href: "/admin/settings",
    },
    { key: "trip", done: facts.hasTrip, optional: false, href: "/admin/trips/new" },
    {
      key: "post",
      done: facts.hasPublishedPost,
      optional: false,
      href: "/admin/posts/new",
    },
    {
      key: "ai",
      done: facts.aiConfigured,
      optional: true,
      href: "/admin/settings",
    },
  ];
}

/** True once every required step is done — the point at which the card retires. */
export function onboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.optional || s.done);
}
