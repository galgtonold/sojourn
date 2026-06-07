"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListChecks, Save, Trash2 } from "lucide-react";
import { slugify } from "@/lib/utils";
import { ImageUploader } from "@/components/image-uploader";
import { useT } from "@/components/i18n";
import { parseDirectives, validateBody } from "@/lib/interactions-parse";

export type EditablePost = {
  id?: string;
  title: string;
  slug: string;
  location: string;
  excerpt: string;
  body: string;
  cover_image: string;
  cover_alt: string;
  trip_id: string;
  lat: string;
  lng: string;
  published: boolean;
};

const EMPTY: EditablePost = {
  title: "",
  slug: "",
  location: "",
  excerpt: "",
  body: "",
  cover_image: "",
  cover_alt: "",
  trip_id: "",
  lat: "",
  lng: "",
  published: false,
};

export function PostEditor({
  initial,
  trips = [],
  photoIds = [],
  interactionIds = [],
}: {
  initial?: EditablePost;
  trips?: { id: string; title: string }[];
  photoIds?: string[];
  interactionIds?: string[];
}) {
  const router = useRouter();
  const t = useT();
  const [post, setPost] = useState<EditablePost>(initial ?? EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = Boolean(post.id);

  // Live check of the body's references and inline poll/quiz blocks.
  const { issues, pendingCount } = useMemo(() => {
    const ctx = {
      photoIds,
      photoCount: photoIds.length,
      interactionIds,
      interactionCount: interactionIds.length,
    };
    const pending = parseDirectives(post.body).filter(
      (d) => d.problems.length === 0,
    ).length;
    return { issues: validateBody(post.body, ctx), pendingCount: pending };
  }, [post.body, photoIds, interactionIds]);

  function set<K extends keyof EditablePost>(key: K, value: EditablePost[K]) {
    setPost((p) => ({ ...p, [key]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const payload = {
      ...post,
      slug: post.slug || slugify(post.title),
      trip_id: post.trip_id || null,
      lat: post.lat ? Number(post.lat) : null,
      lng: post.lng ? Number(post.lng) : null,
    };
    try {
      const res = await fetch(
        isEdit ? `/api/admin/posts/${post.id}` : "/api/admin/posts",
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
    if (!post.id || !confirm(t("admin.editor.deleteConfirm"))) return;
    setBusy(true);
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    router.push("/admin");
    router.refresh();
  }

  const input =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  return (
    <div className="space-y-4">
      <input
        className={`${input} font-display text-lg`}
        placeholder={t("admin.editor.title")}
        value={post.title}
        onChange={(e) => set("title", e.target.value)}
      />
      <input
        className={input}
        placeholder={t("admin.editor.location")}
        value={post.location}
        onChange={(e) => set("location", e.target.value)}
      />
      {trips.length > 0 && (
        <label className="block text-sm text-sand-100/60">
          {t("admin.editor.trip")}
          <select
            value={post.trip_id}
            onChange={(e) => set("trip_id", e.target.value)}
            className={`${input} mt-1`}
          >
            <option value="">{t("admin.editor.tripNone")}</option>
            {trips.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <ImageUploader
        value={post.cover_image}
        onChange={(url) => set("cover_image", url)}
      />
      <input
        className={input}
        placeholder={t("admin.editor.coverUrl")}
        value={post.cover_image}
        onChange={(e) => set("cover_image", e.target.value)}
      />
      <input
        className={input}
        placeholder={t("admin.editor.coverAlt")}
        value={post.cover_alt}
        onChange={(e) => set("cover_alt", e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <input
          className={input}
          placeholder={t("admin.editor.lat")}
          value={post.lat}
          onChange={(e) => set("lat", e.target.value)}
        />
        <input
          className={input}
          placeholder={t("admin.editor.lng")}
          value={post.lng}
          onChange={(e) => set("lng", e.target.value)}
        />
      </div>
      <textarea
        className={`${input} resize-y`}
        rows={2}
        placeholder={t("admin.editor.excerpt")}
        value={post.excerpt}
        onChange={(e) => set("excerpt", e.target.value)}
      />
      <textarea
        className={`${input} resize-y font-mono`}
        rows={14}
        placeholder={t("admin.editor.body")}
        value={post.body}
        onChange={(e) => set("body", e.target.value)}
      />
      <p className="text-xs text-sand-100/40">{t("admin.editor.hint")}</p>
      <p className="text-xs text-sand-100/40">{t("admin.litter.hint")}</p>

      {pendingCount > 0 && (
        <p className="flex items-center gap-2 text-xs text-ember-300">
          <ListChecks className="size-3.5" />
          {t("admin.litter.pending", { n: pendingCount })}
        </p>
      )}
      {issues.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300">
          {issues.map((iss, i) => (
            <li key={i} className="flex items-center gap-2">
              <AlertTriangle className="size-3.5 shrink-0" />
              {iss.type === "unknown-photo"
                ? t("admin.litter.brokenPhoto", { ref: iss.ref })
                : iss.type === "unknown-ask"
                  ? t("admin.litter.brokenAsk", { ref: iss.ref })
                  : t("admin.litter.badBlock", {
                      kind: iss.kind,
                      problems: iss.problems.join(", "),
                    })}
            </li>
          ))}
        </ul>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={post.published}
          onChange={(e) => set("published", e.target.checked)}
          className="size-4 accent-[#f56a1f]"
        />
        {t("admin.published")}
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={busy || !post.title}
          className="inline-flex items-center gap-2 rounded-full bg-ember-500 px-5 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-ember-400 disabled:opacity-50"
        >
          <Save className="size-4" />{" "}
          {busy ? t("admin.editor.saving") : t("admin.editor.save")}
        </button>
        {isEdit && (
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
