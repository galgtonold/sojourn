"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useT } from "@/components/i18n";

export default function AccountPage() {
  const t = useT();
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBrowserSupabase()
      ?.auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (next.length < 8) {
      setError(t("admin.account.errMin"));
      return;
    }
    if (next !== confirm) {
      setError(t("admin.account.errMatch"));
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase || !email) {
      setError(t("admin.account.errGeneric"));
      return;
    }

    setStatus("saving");
    // Verify the current password by re-authenticating before changing it.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (signInErr) {
      setError(t("admin.account.errCurrent"));
      setStatus("idle");
      return;
    }

    const { error: updErr } = await supabase.auth.updateUser({ password: next });
    if (updErr) {
      setError(updErr.message);
      setStatus("idle");
      return;
    }

    setStatus("done");
    setCurrent("");
    setNext("");
    setConfirm("");
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div className="mx-auto max-w-md px-6 pb-24 pt-28">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-sand-100/70 hover:text-ember-400"
      >
        <ArrowLeft className="size-4" /> {t("admin.dashboardLink")}
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <KeyRound className="size-6 text-ember-400" />
        <h1 className="font-display text-3xl font-semibold">
          {t("admin.account.title")}
        </h1>
      </div>
      {email && (
        <p className="mb-6 text-sm text-sand-100/50">
          {t("admin.signedInAs", { email })}
        </p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder={t("admin.account.current")}
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder={t("admin.account.new")}
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("admin.account.confirm")}
          className={input}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}
        {status === "done" && (
          <p className="text-sm text-sage-400">{t("admin.account.done")}</p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {status === "saving"
            ? t("admin.account.updating")
            : t("admin.account.update")}
        </button>
      </form>
    </div>
  );
}
