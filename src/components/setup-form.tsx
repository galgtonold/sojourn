"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

/** The SQL that reopens a lapsed claim window — shown verbatim so it is a
 *  copy-paste, not a puzzle. Kept in sync with 0039_setup_window.sql. */
const REOPEN_SQL =
  "update public.site_settings set setup_opened_at = now() where id = 1;";

export type SetupMode =
  /** Claimable now. */
  | "claim"
  /** No service role or no migrations — nothing can be claimed yet. */
  | "not-ready"
  /** Claimable once, but the window lapsed. */
  | "expired";

// First-run owner claim. The page decides which of the three states applies;
// this component just displays it.
export default function SetupForm({ mode }: { mode: SetupMode }) {
  const router = useRouter();
  const t = useT();
  const [siteName, setSiteName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ownerExists, setOwnerExists] = useState(false);
  const [busy, setBusy] = useState(false);

  if (mode !== "claim") {
    const expired = mode === "expired";
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-md space-y-4 rounded-3xl bg-ink-900 p-8 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-ember-400" />
            <h1 className="font-display text-2xl font-semibold">
              {t(
                expired
                  ? "admin.setup.expiredTitle"
                  : "admin.setup.notReadyTitle",
              )}
            </h1>
          </div>
          <p className="text-sm text-sand-100/50">
            {t(
              expired ? "admin.setup.expiredBody" : "admin.setup.notReadyBody",
            )}
          </p>
          {expired && (
            <pre className="overflow-x-auto rounded-xl bg-ink-800 p-3 text-xs leading-relaxed text-sand-100/80">
              <code>{REOPEN_SQL}</code>
            </pre>
          )}
        </div>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== repeat) {
      setError(t("admin.setup.mismatch"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        if (res.status === 410) {
          setOwnerExists(true);
          setError(t("admin.setup.errorOwnerExists"));
        } else if (res.status === 403) {
          // Lapsed between this page rendering and the submit.
          setError(t("admin.setup.errorExpired"));
        } else if (res.status === 409) {
          setError(t("admin.setup.errorEmailTaken"));
        } else if (res.status === 429) {
          setError(t("admin.setup.errorRateLimited"));
        } else {
          setError(t("admin.setup.errorGeneric"));
        }
        setBusy(false);
        return;
      }
      const supabase = getBrowserSupabase();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        setBusy(false);
        return;
      }
      // Name the site through the ordinary owner-gated settings route (we are
      // the owner now), so /api/setup stays a pure account-claim endpoint.
      // Deliberately non-fatal: the account is created and signed in either
      // way, and the dashboard checklist still asks for a name if this failed.
      await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_name: siteName.trim() }),
      }).catch(() => {});
      router.push("/admin");
      router.refresh();
    } catch {
      setError(t("admin.setup.errorGeneric"));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-3xl bg-ink-900 p-8 ring-1 ring-white/10"
      >
        <div className="flex items-center gap-2">
          <Compass className="size-6 text-ember-400" />
          <h1 className="font-display text-2xl font-semibold">
            {t("admin.setup.title")}
          </h1>
        </div>
        <p className="text-sm text-sand-100/50">{t("admin.setup.subtitle")}</p>

        <input
          type="text"
          required
          maxLength={80}
          autoComplete="off"
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          placeholder={t("admin.setup.siteName")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("admin.setup.emailPlaceholder")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />
        <input
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("admin.setup.password")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />
        <input
          type="password"
          required
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder={t("admin.setup.passwordRepeat")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}
        {ownerExists && (
          <Link
            href="/admin/login"
            className="block text-sm text-ember-400 underline underline-offset-2"
          >
            {t("admin.setup.goToLogin")}
          </Link>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {busy ? t("admin.setup.creating") : t("admin.setup.create")}
        </button>
      </form>
    </div>
  );
}
