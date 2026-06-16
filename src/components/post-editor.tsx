"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListChecks, MapPin, Save, Trash2 } from "lucide-react";
import { slugify } from "@/lib/utils";
import type { Photo } from "@/lib/types";
import { ImageUploader } from "@/components/image-uploader";
import { LocationDialog } from "@/components/location-dialog";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown-editor";
import { PhotoPalette } from "@/components/photo-palette";
import { EditorPreview } from "@/components/editor-preview";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";
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
  date: string;
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
  date: "",
  lat: "",
  lng: "",
  published: false,
};

export function PostEditor({
  initial,
  trips = [],
  photos = [],
  photoIds = [],
  interactionIds = [],
}: {
  initial?: EditablePost;
  trips?: { id: string; title: string }[];
  photos?: Photo[];
  photoIds?: string[];
  interactionIds?: string[];
}) {
  const router = useRouter();
  const t = useT();
  const confirm = useConfirm();
  const [post, setPost] = useState<EditablePost>(
    initial ?? { ...EMPTY, date: new Date().toISOString().slice(0, 10) },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locOpen, setLocOpen] = useState(false);
  const isEdit = Boolean(post.id);
  const editorRef = useRef<MarkdownEditorHandle>(null);

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
    // A draft saves with anything still missing; publishing needs a title + trip.
    if (post.published && (!post.title.trim() || !post.trip_id)) {
      setError(t("admin.editor.publishNeedsFields"));
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      ...post,
      // A fresh draft starts with a placeholder "entwurf-…" slug; re-derive it
      // from the real title on save. A real (published) slug is preserved so a
      // later title edit doesn't change a live URL.
      slug:
        post.slug && !post.slug.startsWith("entwurf-")
          ? post.slug
          : slugify(post.title),
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
      router.push("/admin/posts");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.editor.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!post.id || !(await confirm({ message: t("admin.editor.deleteConfirm"), danger: true, confirmLabel: t("common.delete") }))) return;
    setBusy(true);
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    router.push("/admin/posts");
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
      <label className="block text-sm text-sand-100/60">
        {t("admin.editor.trip")}
        {trips.length > 0 ? (
          <select
            value={post.trip_id}
            onChange={(e) => set("trip_id", e.target.value)}
            className={`${input} mt-1`}
            required
          >
            <option value="" disabled>
              {t("admin.editor.selectTrip")}
            </option>
            {trips.map((tr) => (
              <option key={tr.id} value={tr.id}>
                {tr.title}
              </option>
            ))}
          </select>
        ) : (
          <p className="mt-1 rounded-xl border border-ember-500/30 bg-ember-500/10 px-3 py-2.5 text-sm text-ember-200">
            {t("admin.editor.tripRequiredNoTrips")}
          </p>
        )}
      </label>
      <label className="block text-sm text-sand-100/60">
        {t("admin.editor.date")}
        <input
          type="date"
          className={`${input} mt-1`}
          value={post.date}
          onChange={(e) => set("date", e.target.value)}
        />
      </label>
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
      <button
        type="button"
        onClick={() => setLocOpen(true)}
        className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-left text-sm transition hover:border-ember-400"
      >
        <MapPin className="size-4 shrink-0 text-ember-400" />
        <span className="flex-1 truncate text-sand-100/80">
          {post.lat && post.lng
            ? `${post.lat}, ${post.lng}`
            : t("admin.location.none")}
        </span>
        <span className="shrink-0 text-xs font-medium text-ember-400">
          {post.lat && post.lng
            ? t("admin.location.change")
            : t("admin.location.set")}
        </span>
      </button>
      <LocationDialog
        open={locOpen}
        initialLat={post.lat}
        initialLng={post.lng}
        onClose={() => setLocOpen(false)}
        onSave={(la, ln) => setPost((p) => ({ ...p, lat: la, lng: ln }))}
        allowClear
      />
      <textarea
        className={`${input} resize-y`}
        rows={2}
        placeholder={t("admin.editor.excerpt")}
        value={post.excerpt}
        onChange={(e) => set("excerpt", e.target.value)}
      />
      <PhotoPalette
        photos={photos}
        body={post.body}
        onInsert={(tag) =>
          editorRef.current?.insertAtCursor(tag, { block: true })
        }
      />
      <MarkdownEditor
        ref={editorRef}
        value={post.body}
        onChange={(v) => set("body", v)}
        placeholder={t("admin.editor.body")}
        rows={14}
      />
      <EditorPreview body={post.body} photos={photos} />
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

      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={post.published}
            disabled={!post.title || !post.trip_id}
            onChange={(e) => set("published", e.target.checked)}
            className="size-4 accent-[#f56a1f] disabled:opacity-40"
          />
          {t("admin.published")}
        </label>
        {(!post.title || !post.trip_id) && (
          <p className="mt-1 text-xs text-sand-100/40">
            {t("admin.editor.publishNeedsFields")}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={busy}
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
