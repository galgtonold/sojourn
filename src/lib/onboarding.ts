// What a freshly claimed install still has to do, derived entirely from what is
// already in the database — there is no "onboarding progress" to store, so this
// is always right, including for installs that predate the checklist.
import { settingsHref } from "@/lib/settings-areas";

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
    // Settings-shaped steps take their destination from the settings registry,
    // so a section that moves takes its checklist link with it. These three
    // used to be hardcoded to "/admin/settings" — all of them, including the AI
    // one, which landed the reader on the branding form.
    {
      key: "name",
      done: facts.nameSet,
      optional: false,
      href: settingsHref("site"),
    },
    {
      key: "tagline",
      done: facts.taglineSet,
      optional: false,
      href: settingsHref("site"),
    },
    // Content steps stay as they are: creating a trip or publishing a post
    // isn't configuration, and folding them into the settings registry would be
    // tidiness at the cost of meaning.
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
      href: settingsHref("ai"),
    },
  ];
}

/** True once every required step is done — the point at which the card retires. */
export function onboardingComplete(steps: OnboardingStep[]): boolean {
  return steps.every((s) => s.optional || s.done);
}
