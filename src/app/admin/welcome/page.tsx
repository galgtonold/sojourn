"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { useT } from "@/components/i18n";

export default function Welcome() {
  const t = useT();
  const router = useRouter();
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">(
    "checking",
  );
  const [detail, setDetail] = useState<string | null>(null);
  // Our own invite token, held in memory until the password is submitted — we
  // never establish a session just from opening the link.
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setPhase("invalid");
      return;
    }

    const url = new URL(window.location.href);
    const q = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const errorDescription =
      q.get("error_description") || hash.get("error_description");
    const tokenHash = q.get("token_hash");
    const type = (q.get("type") as EmailOtpType | null) ?? "invite";
    const code = q.get("code");
    const invite = q.get("invite");

    function stripUrl() {
      window.history.replaceState({}, "", window.location.pathname);
    }

    if (errorDescription) {
      setDetail(errorDescription);
      setPhase("invalid");
      return;
    }

    // Our own invite token: do NOT touch the session on open. Just show the
    // password form; the recovery session is established at submit-time, right
    // before the password is set (see submit()). This means merely opening the
    // link — even while signed in as someone else — can't hijack a session or
    // burn the token.
    if (invite) {
      setInviteToken(invite);
      setPhase("ready");
      stripUrl();
      return;
    }

    // Legacy Supabase email links (token_hash / code / implicit) still need a
    // session established up front so the form can call updateUser.
    let cancelled = false;
    const sub = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !cancelled) {
        cancelled = true;
        setPhase("ready");
      }
    });

    (async () => {
      try {
        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data } = await supabase.auth.getSession();
        if (data.session && !cancelled) {
          cancelled = true;
          setPhase("ready");
        }
        stripUrl();
      } catch (e) {
        if (cancelled) return;
        setDetail(e instanceof Error ? e.message : null);
        setPhase("invalid");
      }
    })();

    const timer = setTimeout(() => {
      if (!cancelled) {
        setPhase((p) => (p === "checking" ? "invalid" : p));
      }
    }, 5000);

    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError(t("admin.account.errMin"));
      return;
    }
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setError(t("admin.welcome.invalid"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Invite path: establish the session now (mint a fresh recovery token and
      // verify it), then immediately set the password, then burn the token.
      if (inviteToken) {
        const res = await fetch("/api/invite/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: inviteToken }),
        });
        if (!res.ok) throw new Error(t("admin.welcome.invalid"));
        const fresh = (await res.json()) as {
          token_hash: string;
          type: EmailOtpType;
        };
        const v = await supabase.auth.verifyOtp({
          type: fresh.type,
          token_hash: fresh.token_hash,
        });
        if (v.error) throw v.error;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      if (inviteToken) {
        // Single-use only now that onboarding actually succeeded (best effort).
        await fetch("/api/invite/complete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: inviteToken }),
        }).catch(() => {});
      }

      setBusy(false);
      setDone(true);
      setTimeout(() => router.replace("/admin"), 1200);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : t("admin.welcome.invalid"));
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Compass className="size-6 text-ember-400" />
            <h1 className="font-display text-2xl font-semibold">
              {t("admin.welcome.title")}
            </h1>
          </div>
          <p className="text-sm text-sand-100/60">
            {t("admin.welcome.subtitle", { site: env.siteName })}
          </p>
        </div>

        {phase === "invalid" ? (
          <div className="space-y-1">
            <p className="text-sm text-sand-100/60">
              {t("admin.welcome.invalid")}
            </p>
            {detail && <p className="text-xs text-sand-100/60">{detail}</p>}
          </div>
        ) : phase === "checking" ? (
          <p className="text-sm text-sand-100/50">…</p>
        ) : done ? (
          <p className="text-sm text-sage-400">{t("admin.welcome.done")}</p>
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
