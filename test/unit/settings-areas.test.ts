import { describe, it, expect } from "vitest";
import { SETTINGS_AREAS, settingsHref } from "@/lib/settings-areas";
import { onboardingSteps } from "@/lib/onboarding";

// One list owns where each settings area lives. The onboarding checklist reads
// it instead of hardcoding paths, because the failure it prevents is silent: a
// section moves, the checklist keeps linking to where it used to be, and the
// only symptom is a new owner landing on the wrong page.

const FACTS = {
  nameSet: false,
  taglineSet: false,
  hasTrip: false,
  hasPublishedPost: false,
  aiConfigured: false,
};

describe("SETTINGS_AREAS", () => {
  it("gives every area a distinct route", () => {
    const hrefs = SETTINGS_AREAS.map((a) => a.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the site area at the settings root, so /admin/settings is never a dead end", () => {
    expect(settingsHref("site")).toBe("/admin/settings");
  });

  it("routes every area under /admin/settings", () => {
    for (const a of SETTINGS_AREAS) {
      expect(a.href.startsWith("/admin/settings")).toBe(true);
    }
  });
});

describe("onboarding links point at the area that fixes the step", () => {
  const steps = onboardingSteps(FACTS);
  const by = (key: string) => steps.find((s) => s.key === key)!;

  it("sends the name and tagline steps to the site area", () => {
    expect(by("name").href).toBe(settingsHref("site"));
    expect(by("tagline").href).toBe(settingsHref("site"));
  });

  it("sends the AI step to the AI area, not the settings root", () => {
    // The bug this replaces: three of five steps pointed at /admin/settings,
    // so "connect an AI provider" landed you on the branding form.
    expect(by("ai").href).toBe(settingsHref("ai"));
    expect(by("ai").href).not.toBe("/admin/settings");
  });

  it("leaves content steps alone — they are not settings", () => {
    expect(by("trip").href).toBe("/admin/trips/new");
    expect(by("post").href).toBe("/admin/posts/new");
  });

  it("still reports done-ness from the facts, unchanged", () => {
    const done = onboardingSteps({ ...FACTS, nameSet: true, aiConfigured: true });
    expect(done.find((s) => s.key === "name")!.done).toBe(true);
    expect(done.find((s) => s.key === "ai")!.done).toBe(true);
    expect(done.find((s) => s.key === "tagline")!.done).toBe(false);
  });
});
