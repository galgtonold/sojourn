import Link from "next/link";
import { ArrowRight, Check, Circle } from "lucide-react";
import { T } from "@/components/i18n";
import {
  onboardingSteps,
  onboardingComplete,
  type OnboardingFacts,
  type OnboardingKey,
} from "@/lib/onboarding";
import type { DictKey } from "@/lib/i18n";

const LABEL: Record<OnboardingKey, DictKey> = {
  name: "admin.onboarding.name",
  tagline: "admin.onboarding.tagline",
  trip: "admin.onboarding.trip",
  post: "admin.onboarding.post",
  ai: "admin.onboarding.ai",
};
const HINT: Record<OnboardingKey, DictKey> = {
  name: "admin.onboarding.nameHint",
  tagline: "admin.onboarding.taglineHint",
  trip: "admin.onboarding.tripHint",
  post: "admin.onboarding.postHint",
  ai: "admin.onboarding.aiHint",
};

/** The "finish setting up" card. Renders nothing once the required steps are
 *  done, so it retires itself without anyone having to dismiss it. */
export function SetupChecklist(facts: OnboardingFacts) {
  const steps = onboardingSteps(facts);
  if (onboardingComplete(steps)) return null;

  const required = steps.filter((s) => !s.optional);
  const done = required.filter((s) => s.done).length;

  return (
    <section className="mt-8 rounded-2xl bg-ink-900 p-5 ring-1 ring-ember-500/20">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-lg font-semibold">
          <T k="admin.onboarding.title" />
        </h2>
        <p className="text-sm tabular-nums text-sand-100/50">
          <T
            k="admin.onboarding.progress"
            vars={{ done, total: required.length }}
          />
        </p>
      </div>

      <ul className="mt-4 space-y-1">
        {steps.map((step) => (
          <li key={step.key}>
            <Link
              href={step.href}
              className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-white/5"
            >
              <span
                className={
                  step.done
                    ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-sage-500/20 text-sage-400"
                    : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-sand-100/25"
                }
                aria-hidden
              >
                {step.done ? (
                  <Check className="size-3.5" />
                ) : (
                  <Circle className="size-3.5" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={
                    step.done
                      ? "text-sm text-sand-100/40 line-through decoration-sand-100/25"
                      : "text-sm font-medium"
                  }
                >
                  <T k={LABEL[step.key]} />
                </span>
                {step.optional && !step.done && (
                  <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[0.68rem] uppercase tracking-wide text-sand-100/40">
                    <T k="admin.onboarding.optional" />
                  </span>
                )}
                {!step.done && (
                  <span className="mt-0.5 block text-xs text-sand-100/45">
                    <T k={HINT[step.key]} />
                  </span>
                )}
              </span>

              {!step.done && (
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-sand-100/25 transition group-hover:translate-x-0.5 group-hover:text-ember-400" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
