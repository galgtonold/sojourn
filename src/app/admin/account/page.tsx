"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function AccountPage() {
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
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don’t match.");
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase || !email) {
      setError("Not available in demo mode.");
      return;
    }

    setStatus("saving");
    // Verify the current password by re-authenticating before changing it.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (signInErr) {
      setError("Current password is incorrect.");
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
        <ArrowLeft className="size-4" /> Dashboard
      </Link>

      <div className="mb-6 flex items-center gap-2">
        <KeyRound className="size-6 text-ember-400" />
        <h1 className="font-display text-3xl font-semibold">Change password</h1>
      </div>
      {email && (
        <p className="mb-6 text-sm text-sand-100/50">Signed in as {email}</p>
      )}

      <form onSubmit={submit} className="space-y-4">
        <input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (min 8 characters)"
          className={input}
        />
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          className={input}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}
        {status === "done" && (
          <p className="text-sm text-lagoon-400">
            Password updated. Use it next time you sign in.
          </p>
        )}

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-full bg-ember-500 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {status === "saving" ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
