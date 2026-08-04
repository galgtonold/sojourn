// The settings areas, in nav order — one list that both the settings nav and
// the onboarding checklist read.
//
// Settings used to be a single page with four unrelated concerns stacked on it:
// branding, analytics, AI keys, writing style. Nothing was addressable, so the
// checklist's "add your site name", "add a tagline" and "connect an AI
// provider" all linked to /admin/settings and left the reader to hunt. Analytics
// then landed wedged between branding and AI keys — not because it belonged
// there, but because there was nowhere else to put it.
//
// Splitting fixes the hunting; keeping the routes HERE rather than in
// onboarding.ts fixes the drift. The old failure was silent: move a section and
// the checklist keeps linking where it used to be, with no error and no test
// catching it.

import type { DictKey } from "@/lib/i18n";

export type SettingsAreaId =
  | "site"
  | "writing"
  | "ai"
  | "privacy"
  | "updates"
  | "backup";

export type SettingsArea = {
  id: SettingsAreaId;
  href: string;
  /** Nav label. The page's own heading is separate and can be longer. */
  label: DictKey;
};

export const SETTINGS_AREAS: readonly SettingsArea[] = [
  // Identity: what the site is called and how it introduces itself. First
  // because it is what a non-technical owner came to change, and it stays at
  // the settings root so /admin/settings is never a dead end.
  { id: "site", href: "/admin/settings", label: "admin.settings.nav.site" },
  // The author's own voice. It briefly lived beside the API keys, on the
  // grounds that AI drafts are what read it — a true dependency and the wrong
  // mental model: a personal, expressive setting does not belong next to
  // secrets. This is also the natural home for the content settings that don't
  // exist yet (comment policy, default language, reading-time tuning).
  {
    id: "writing",
    href: "/admin/settings/writing",
    label: "admin.settings.nav.writing",
  },
  // Just the plumbing: which provider, which key, which model.
  { id: "ai", href: "/admin/settings/ai", label: "admin.settings.nav.ai" },
  // Analytics, and an honest account of the error reporting the owner can see
  // but not change from here.
  {
    id: "privacy",
    href: "/admin/settings/privacy",
    label: "admin.settings.nav.privacy",
  },
  // Not a setting so much as a status page, and last because it is the one
  // read rarely and urgently rather than often and idly: what version this is,
  // whether a newer one exists, how to get it on this particular host, and
  // whether the database kept up. It lives among the settings anyway because it
  // owns one real switch — whether to ask GitHub at all — and because a sixth
  // item in the top nav would crowd out the five people use daily.
  {
    id: "updates",
    href: "/admin/settings/updates",
    label: "admin.settings.nav.updates",
  },
  // Last, and for the same reason as updates: nobody browses here. They arrive
  // because they are moving hosts or because something has gone wrong, and on
  // both occasions they want it findable rather than prominent.
  {
    id: "backup",
    href: "/admin/settings/backup",
    label: "admin.settings.nav.backup",
  },
] as const;

export function settingsHref(id: SettingsAreaId): string {
  // Non-null: the id type is closed over the list above, so a miss is a
  // compile error rather than a runtime surprise.
  return SETTINGS_AREAS.find((a) => a.id === id)!.href;
}

/** The area a path belongs to, for marking the nav — longest match wins, since
 *  every href is a prefix of the settings root. */
export function activeSettingsArea(pathname: string): SettingsAreaId {
  const match = [...SETTINGS_AREAS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
  return match?.id ?? "site";
}
