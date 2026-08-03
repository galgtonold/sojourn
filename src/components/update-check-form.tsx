"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/components/i18n";

/**
 * Whether this install may ask GitHub if a newer Sojourn exists.
 *
 * The switch is here rather than on the privacy page because this is the page
 * that makes the request — but it is the same kind of decision, and gets the
 * same treatment: on by default, visible, and off means off, not "off but we
 * still check once a day".
 */
export function UpdateCheckForm({ initial }: { initial: boolean }) {
  const t = useT();
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function save(next: boolean) {
    setValue(next);
    setBusy(true);
    setError(false);
    const res = await fetch("/api/admin/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ update_check: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setValue(!next);
      setError(true);
      return;
    }
    // The version row above is rendered from this, so it has to re-render for
    // the change to mean anything on screen.
    router.refresh();
  }

  return (
    <section className="rounded-3xl bg-ink-900 p-6 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <Radar className="size-5 text-ember-400" />
        <h3 className="font-display text-xl font-semibold">
          {t("admin.updates.checkHeading")}
        </h3>
      </div>
      <p className="mt-2 text-sm text-sand-100/60">
        {t("admin.updates.checkIntro")}
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {[true, false].map((on) => (
          <button
            key={String(on)}
            type="button"
            disabled={busy}
            onClick={() => save(on)}
            aria-pressed={value === on}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition disabled:opacity-50",
              value === on
                ? "bg-ember-500 text-ink-950"
                : "bg-white/5 text-sand-100/80 ring-1 ring-white/10 hover:bg-white/10",
            )}
          >
            {t(on ? "admin.updates.checkOn" : "admin.updates.checkOff")}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-xs text-red-400">{t("admin.updates.checkError")}</p>
      )}
    </section>
  );
}
