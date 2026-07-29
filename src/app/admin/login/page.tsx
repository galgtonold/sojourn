"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";
import { env } from "@/lib/env";

// A fresh install has nobody to sign in: middleware sends those visitors to
// /admin/setup before this ever renders (see @/lib/admin-route).
export default function AdminLogin() {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const supabase = getBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/admin");
    router.refresh();
  }

  // The showcase deployment lets anyone in with one click. The password lives on
  // the server: this posts, and the response carries the session cookie.
  async function enterDemo() {
    setError(null);
    setDemoBusy(true);
    const res = await fetch("/api/demo/login", { method: "POST" });
    if (!res.ok) {
      setError(t("demo.login.failed"));
      setDemoBusy(false);
      return;
    }
    router.push("/admin");
    router.refresh();
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
            {t("admin.login.title")}
          </h1>
        </div>
        <p className="text-sm text-sand-100/50">{t("admin.login.subtitle")}</p>

        {/* On the showcase deployment this is the point of the page, so it goes
            above the fields — a visitor with no account shouldn't have to read
            past a password form to find the way in. Absent everywhere else. */}
        {env.demoMode && (
          <div className="space-y-3 pt-1">
            <button
              type="button"
              onClick={enterDemo}
              disabled={demoBusy}
              className="w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
            >
              {demoBusy ? t("demo.login.entering") : t("demo.login.enter")}
            </button>
            <p className="text-center text-xs text-sand-100/50">
              {t("demo.login.hint")}
            </p>
            <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-sand-100/50">
              <span className="h-px flex-1 bg-white/10" />
              {t("demo.login.or")}
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("admin.login.emailPlaceholder")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t("admin.login.password")}
          className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
        />

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className={
            // Two ember buttons would compete; on the demo the one-click entry
            // is the primary action and this drops to second billing.
            env.demoMode
              ? "w-full rounded-full bg-white/5 py-2.5 text-sm font-semibold text-sand-100/80 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
              : "w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
          }
        >
          {busy ? t("admin.login.signingIn") : t("admin.login.signIn")}
        </button>
      </form>
    </div>
  );
}
