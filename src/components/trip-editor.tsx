"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2 } from "lucide-react";
import { slugify } from "@/lib/utils";
import { useBeforeUnload } from "@/lib/use-before-unload";
import { ImageUploader } from "@/components/image-uploader";
import { AiContextRefiner } from "@/components/ai-context-refiner";
import { DateField } from "@/components/date-field";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";

export type EditableTrip = {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  ai_context: string;
  cover_image: string;
  start_date: string;
  end_date: string;
};

const EMPTY: EditableTrip = {
  title: "",
  slug: "",
  summary: "",
  ai_context: "",
  cover_image: "",
  start_date: "",
  end_date: "",
};

export function TripEditor({
  initial,
  canDelete = true,
}: {
  initial?: EditableTrip;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const confirm = useConfirm();
  const [trip, setTrip] = useState<EditableTrip>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(trip.id);

  // Warn before leaving with unsaved edits (a successful save navigates away).
  useBeforeUnload(JSON.stringify(trip) !== JSON.stringify(initial ?? EMPTY));

  function set<K extends keyof EditableTrip>(key: K, value: EditableTrip[K]) {
    setTrip((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      ...trip,
      slug: trip.slug || slugify(trip.title),
      start_date: trip.start_date || null,
      end_date: trip.end_date || null,
    };
    try {
      const res = await fetch(
        isEdit ? `/api/admin/trips/${trip.id}` : "/api/admin/trips",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("admin.editor.saveFailed"));
      }
      router.push("/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.editor.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!trip.id || !(await confirm({ message: t("admin.trip.deleteConfirm"), danger: true, confirmLabel: t("common.delete") }))) return;
    setBusy(true);
    await fetch(`/api/admin/trips/${trip.id}`, { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div className="space-y-4">
      <input
        className={`${input} font-display text-lg`}
        placeholder={t("admin.trip.title")}
        value={trip.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <ImageUploader
        value={trip.cover_image}
        onChange={(url) => set("cover_image", url)}
        folder="trips"
        label={t("admin.trip.cover")}
      />
      <input
        className={input}
        placeholder={t("admin.editor.coverUrl")}
        value={trip.cover_image}
        onChange={(e) => set("cover_image", e.target.value)}
      />
      <textarea
        className={`${input} resize-y`}
        rows={3}
        placeholder={t("admin.trip.summary")}
        value={trip.summary}
        onChange={(e) => set("summary", e.target.value)}
      />

      {/* Internal context — never shown to readers, only feeds AI generation. */}
      <div className="space-y-2 rounded-2xl border border-white/10 bg-ink-900/40 p-3">
        <div>
          <p className="text-sm font-medium text-sand-100/80">
            {t("admin.trip.aiContext")}
          </p>
          <p className="text-xs text-sand-100/60">
            {t("admin.trip.aiContextHint")}
          </p>
        </div>
        <textarea
          className={`${input} resize-y`}
          rows={5}
          placeholder={t("admin.trip.aiContextPlaceholder")}
          value={trip.ai_context}
          onChange={(e) => set("ai_context", e.target.value)}
        />
        <AiContextRefiner
          tripId={trip.id}
          title={trip.title}
          summary={trip.summary}
          context={trip.ai_context}
          onApply={(c) => set("ai_context", c)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm text-sand-100/60" htmlFor="trip-start">
            {t("admin.trip.start")}
          </label>
          <DateField
            id="trip-start"
            value={trip.start_date}
            onChange={(v) => set("start_date", v)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-sand-100/60" htmlFor="trip-end">
            {t("admin.trip.end")}
          </label>
          <DateField
            id="trip-end"
            value={trip.end_date}
            onChange={(v) => set("end_date", v)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={busy || !trip.title}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Save className="size-4" />{" "}
          {busy ? t("admin.editor.saving") : t("admin.editor.save")}
        </button>
        {isEdit && canDelete && (
          <button
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2.5 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="size-4" /> {t("admin.editor.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
