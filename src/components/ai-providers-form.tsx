"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plug, Save } from "lucide-react";
import { useT } from "@/components/i18n";
import {
  AI_DEFAULTS,
  AI_FIELD_GROUPS,
  isSecretField,
  type AiFieldKey,
  type AiGroup,
  type AiSource,
} from "@/lib/ai-config-fields";
import type { TestResult } from "@/app/api/admin/settings/ai/test/route";
import { cn } from "@/lib/utils";

export type AiFieldState = { source: AiSource; value: string; masked: string };

// The probe answers 200 for every real verdict, so a non-200 or a thrown fetch
// means the request never reached a provider at all. That is not a verdict and
// must not be rendered as one — hence a member the route can't produce.
type TestSlot = TestResult | { ok: false; reason: "unreachable" };

/**
 * Edits the AI provider config. Renders even when nothing is configured — this
 * is the only place that says AI is off and why, so hiding it would recreate the
 * silence it exists to fix.
 *
 * Secrets are write-only: the server sends a mask, never a value, so a secret
 * input starts blank and an untouched one is not submitted. Every field shows
 * whether it comes from here or the environment, because a value set here wins;
 * Clear removes it and lets the environment take over again.
 */
export function AiProvidersForm({
  initial,
}: {
  initial: Record<AiFieldKey, AiFieldState>;
}) {
  const t = useT();
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [edits, setEdits] = useState<Partial<Record<AiFieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tested, setTested] = useState<Partial<Record<AiGroup, TestSlot>>>({});
  const [testing, setTesting] = useState<AiGroup | null>(null);

  // A secret's stored value never reaches the browser, so its input is always
  // blank until typed into; the mask carries the "something is stored" signal.
  const shown = (k: AiFieldKey) =>
    edits[k] ?? (isSecretField(k) ? "" : fields[k].value);

  // PUT drops blank fields and still returns 200, so a blank input submitted in
  // the hope of clearing a value would report success and change nothing. Only
  // fields actually typed to a value are sent; clearing is DELETE's job.
  const pending = Object.entries(edits).filter(
    ([, v]) => (v ?? "").trim() !== "",
  );

  function setField(k: AiFieldKey, v: string) {
    setEdits((e) => ({ ...e, [k]: v }));
    setSaved(false);
  }

  async function save() {
    if (pending.length === 0) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/ai", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: Object.fromEntries(pending) }),
      });
      if (!res.ok) throw new Error("failed");
      setSaved(true);
      setEdits({});
      await refresh();
      router.refresh();
    } catch {
      setError(t("admin.err.save"));
    } finally {
      setBusy(false);
    }
  }

  async function clear(k: AiFieldKey) {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/settings/ai", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keys: [k] }),
      });
      if (!res.ok) throw new Error("failed");
      // Drop any half-typed edit too, so the input doesn't keep showing a value
      // the owner just asked to remove.
      setEdits(({ [k]: _dropped, ...rest }) => rest);
      await refresh();
      router.refresh();
    } catch {
      setError(t("admin.err.save"));
    } finally {
      setBusy(false);
    }
  }

  /** Re-read presence + source after a write; the server owns both. */
  async function refresh() {
    const res = await fetch("/api/admin/settings/ai");
    if (res.ok) setFields((await res.json()).fields);
  }

  async function test(group: AiGroup) {
    setTesting(group);
    try {
      const res = await fetch("/api/admin/settings/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ group }),
      });
      if (!res.ok) throw new Error("failed");
      const result: TestResult = await res.json();
      setTested((s) => ({ ...s, [group]: result }));
    } catch {
      setTested((s) => ({ ...s, [group]: { ok: false, reason: "unreachable" } }));
    } finally {
      setTesting(null);
    }
  }

  // The route deliberately reports machine-readable reasons and leaves the copy
  // to us. "rejected" is the one case whose detail is provider prose (already
  // redacted server-side) and stands on its own; "no-key" carries no detail at
  // all, so wrapping it in a failure sentence would invent a failure.
  function testMessage(r: TestSlot): string {
    if (r.ok) return t("admin.settings.aiTestOk", { detail: r.detail });
    switch (r.reason) {
      case "no-key":
        return t("admin.settings.aiTestNoKey");
      case "failed":
        return t("admin.settings.aiTestFail", { detail: r.detail });
      case "rejected":
        return r.detail;
      default:
        return t("admin.err.ai");
    }
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  const badge = (s: AiSource) => (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wider",
        s === "db" && "bg-ember-500/15 text-ember-300",
        s === "env" && "bg-white/10 text-sand-100/60",
        s === "inherited" && "bg-white/5 text-sand-100/50",
        s === "unset" && "bg-white/5 text-sand-100/40",
      )}
    >
      {t(`admin.settings.aiSource.${s}`)}
    </span>
  );

  return (
    <div className="space-y-8">
      {AI_FIELD_GROUPS.map(({ group, keys }) => {
        const result = tested[group];
        return (
          <div key={group} className="rounded-2xl border border-white/10 p-5">
            <h3 className="font-display text-lg font-semibold">
              {t(`admin.settings.aiGroup.${group}`)}
            </h3>
            <div className="mt-4 space-y-4">
              {keys.map((k) => (
                <label key={k} className="block">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm text-sand-100/70">
                      {t(`admin.settings.aiField.${k}`)}
                    </span>
                    <span className="flex items-center gap-2">
                      {badge(fields[k].source)}
                      {fields[k].source === "db" && (
                        <button
                          type="button"
                          onClick={() => clear(k)}
                          disabled={busy}
                          className="text-xs text-sand-100/50 underline hover:text-ember-400 disabled:opacity-50"
                        >
                          {t("admin.settings.aiClear")}
                        </button>
                      )}
                    </span>
                  </span>
                  <input
                    type={isSecretField(k) ? "password" : "text"}
                    autoComplete="off"
                    value={shown(k)}
                    onChange={(e) => setField(k, e.target.value)}
                    placeholder={
                      isSecretField(k) ? fields[k].masked : AI_DEFAULTS[k]
                    }
                    className={cn(input, "mt-1.5")}
                  />
                  {isSecretField(k) && fields[k].masked && (
                    <span className="mt-1 block text-xs text-sand-100/50">
                      {t("admin.settings.aiSecretSet", {
                        masked: fields[k].masked,
                      })}
                    </span>
                  )}
                </label>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => test(group)}
                disabled={testing !== null}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs transition hover:border-ember-400 disabled:opacity-50"
              >
                {testing === group ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plug className="size-3.5" />
                )}{" "}
                {t("admin.settings.aiTest")}
              </button>
              {result && (
                <span
                  className={cn(
                    "text-xs",
                    result.ok ? "text-sage-400" : "text-red-400",
                  )}
                >
                  {testMessage(result)}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={busy || pending.length === 0}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}{" "}
          {t("admin.editor.save")}
        </button>
        {saved && (
          <span className="text-sm text-sage-400">
            {t("admin.settings.saved")}
          </span>
        )}
      </div>
    </div>
  );
}
