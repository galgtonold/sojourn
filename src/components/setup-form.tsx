"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Compass } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

// First-run owner claim. `notReady` renders the manual-instructions panel
// instead of the form (no service role, or migrations not applied — see
// getSetupState); the page decides, this component just displays.
export default function SetupForm({ notReady }: { notReady: boolean }) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ownerExists, setOwnerExists] = useState(false);
  const [busy, setBusy] = useState(false);

  if (notReady) {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <div className="w-full max-w-sm space-y-4 rounded-3xl bg-ink-900 p-8 ring-1 ring-white/10">
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-ember-400" />
            <h1 className="font-display text-2xl font-semibold">
              {t("admin.setup.notReadyTitle")}
            </h1>
          </div>
          <p className="text-sm text-sand-100/50">
            {t("admin.setup.notReadyBody")}
          </p>
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
