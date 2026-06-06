"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

export default function Welcome() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The invite/recovery link drops a session into the URL; wait for it.
  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setPhase("invalid");
      return;
    }
    let settled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        settled = true;
        setPhase("ready");
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) {
        settled = true;
        setPhase("ready");
      }
    });
    const timer = setTimeout(() => {
      if (!settled) setPhase("invalid");
    }, 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("admin.account.errMin"));
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = getBrowserSupabase();
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => router.replace("/admin"), 1200);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="size-6 text-ember-400" />
          <h1 className="font-display text-2xl font-semibold">
            {t("admin.welcome.title")}
          </h1>
        </div>

        {phase === "invalid" ? (
          <p className="text-sm text-sand-100/60">{t("admin.welcome.invalid")}</p>
        ) : phase === "checking" ? (
          <p className="text-sm text-sand-100/50">…</p>
        ) : done ? (
          <p className="text-sm text-lagoon-400">{t("admin.welcome.done")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-sand-100/60">{t("admin.welcome.body")}</p>
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("admin.account.new")}
              className="w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
            >
              {busy ? t("admin.account.updating") : t("admin.welcome.save")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
