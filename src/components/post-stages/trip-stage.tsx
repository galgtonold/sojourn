"use client";
import { Select } from "@/components/select";
import { useT } from "@/components/i18n";

const input =
  "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

/** The single trip picker — the post's home and the AI's context. */
export function TripStage({
  value,
  trips,
  onChange,
}: {
  value: string;
  trips: { id: string; title: string }[];
  onChange: (id: string) => void;
}) {
  const t = useT();
  if (trips.length === 0)
    return (
      <p className="rounded-xl border border-ember-500/30 bg-ember-500/10 px-3 py-2.5 text-sm text-ember-200">
        {t("admin.editor.tripRequiredNoTrips")}
      </p>
    );
  return (
    <>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className={input} required>
        <option value="" disabled>
          {t("admin.editor.selectTrip")}
        </option>
        {trips.map((tr) => (
          <option key={tr.id} value={tr.id}>
            {tr.title}
          </option>
        ))}
      </Select>
      <p className="mt-1.5 text-xs text-sand-100/60">{t("admin.editor.tripContextHint")}</p>
    </>
  );
}
