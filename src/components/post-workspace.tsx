"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Image as PhotoIcon,
  Map as MapIcon,
  MessageCircle,
  Route,
  Sparkles,
  SlidersHorizontal,
  SpellCheck,
  Trash2,
} from "lucide-react";
import { slugify } from "@/lib/utils";
import { useBeforeUnload } from "@/lib/use-before-unload";
import { useT } from "@/components/i18n";
import { useConfirm } from "@/components/confirm-dialog";
import { ProofreadDialog, proofreadSignature } from "@/components/proofread-dialog";
import { TranslationBadge } from "@/components/translation-badge";
import { PostSection } from "@/components/post-section";
import { PostActionBar } from "@/components/post-action-bar";
import { TripStage } from "@/components/post-stages/trip-stage";
import { ArticleStage } from "@/components/post-stages/article-stage";
import { DetailsStage } from "@/components/post-stages/details-stage";
import { PhotoManager, type ManagedPhoto } from "@/components/photo-manager";
import { TrackManager, type ManagedTrack } from "@/components/track-manager";
import {
  InteractionManager,
  type ManagedInteraction,
} from "@/components/interaction-manager";
import { AiDraftPanel, type DraftSaved } from "@/components/ai-draft-panel";
import {
  defaultOpenSections,
  type SectionId,
} from "@/lib/post-editor-layout";

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

export function PostWorkspace({
  postId,
  slug,
  initial,
  initialNotes,
  initialPhotoManualOrder,
  aiConfigured,
  trips,
  initialPhotos,
  tracks,
  initialInteractions,
  translationStatus,
}: {
  postId: string;
  slug: string;
  initial: EditablePost;
  initialNotes: string;
  initialPhotoManualOrder: boolean;
  aiConfigured: boolean;
  trips: { id: string; title: string }[];
  initialPhotos: ManagedPhoto[];
  tracks: ManagedTrack[];
  initialInteractions: ManagedInteraction[];
  translationStatus: "none" | "pending" | "ready" | "error";
}) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const [post, setPost] = useState<EditablePost>(initial);
  // Baseline of the last-saved article fields; `dirty` warns before leaving with
  // unsaved edits. (Photos/tracks/interactions persist immediately via their own
  // managers, so only the article fields can be lost.)
  const [savedSnapshot, setSavedSnapshot] = useState<EditablePost>(initial);
  const [interactions, setInteractions] = useState<ManagedInteraction[]>(initialInteractions);
  // Lifted so an uploaded photo is insertable in the article live (no reload).
  const [photos, setPhotos] = useState<ManagedPhoto[]>(initialPhotos);
  // Bumped after an AI captioning pass so PhotoManager re-pulls and shows the
  // freshly-written labels without a manual reload.
  const [photoRefreshKey, setPhotoRefreshKey] = useState(0);
  const [trackCount, setTrackCount] = useState(tracks.length);
  const [busy, setBusy] = useState(false);
  // The AI notes autosave on their own, but a still-pending edit shouldn't be
  // lost on reload — track it so the leave-guard warns for notes too.
  const [notesDirty, setNotesDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofreadOpen, setProofreadOpen] = useState(false);
  const [proofreadSig, setProofreadSig] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<SectionId, boolean>>(
    defaultOpenSections(Boolean(initial.body)),
  );
  const toggle = (id: SectionId) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  function set<K extends keyof EditablePost>(key: K, value: EditablePost[K]) {
    setPost((p) => ({ ...p, [key]: value }));
  }

  // Save logic moved verbatim from the old PostEditor.
  async function save(navigate = false, overrides?: Partial<EditablePost>): Promise<boolean> {
    const current = { ...post, ...(overrides ?? {}) };
    if (current.published && (!current.title.trim() || !current.trip_id)) {
      setError(t("admin.editor.publishNeedsFields"));
      return false;
    }
    setBusy(true);
    setError(null);
    const payload = {
      ...current,
      slug:
        current.slug && !current.slug.startsWith("entwurf-")
          ? current.slug
          : slugify(current.title),
      trip_id: current.trip_id || null,
      lat: current.lat ? Number(current.lat) : null,
      lng: current.lng ? Number(current.lng) : null,
    };
    try {
      const res = await fetch(`/api/admin/posts/${current.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? t("admin.editor.saveFailed"));
      }
      setSavedSnapshot(current);
      if (navigate) {
        router.push("/admin/posts");
        router.refresh();
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : t("admin.editor.saveFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish() {
    const next = !post.published;
    // Nudge a proofread before the first publish of an unproofread version.
    if (next) {
      const sig = proofreadSignature(post.title, post.excerpt ?? "", post.body ?? "");
      if (sig !== proofreadSig) {
        const proceed = await confirm({
          title: t("admin.proofread.nudgeTitle"),
          message: t("admin.proofread.nudgeBody"),
          confirmLabel: t("admin.proofread.publishAnyway"),
          cancelLabel: t("admin.proofread.proofreadFirst"),
        });
        if (!proceed) {
          setProofreadOpen(true);
          return;
        }
      }
    }
    setPost((p) => ({ ...p, published: next }));
    const ok = await save(false, { published: next });
    if (!ok) setPost((p) => ({ ...p, published: !next }));
  }

  async function remove() {
    if (
      !post.id ||
      !(await confirm({
        message: t("admin.editor.deleteConfirm"),
        danger: true,
        confirmLabel: t("common.delete"),
      }))
    )
      return;
    setBusy(true);
    await fetch(`/api/admin/posts/${post.id}`, { method: "DELETE" });
    router.push("/admin/posts");
    router.refresh();
  }

  function handleDraftSaved(s: DraftSaved) {
    setPost((p) => ({
      ...p,
      title: s.title ?? p.title,
      excerpt: s.excerpt ?? "",
      body: s.body ?? "",
      location: s.location ?? "",
      cover_image: s.cover_image ?? p.cover_image,
      lat: s.lat != null ? String(s.lat) : p.lat,
      lng: s.lng != null ? String(s.lng) : p.lng,
      date: s.published_at ? s.published_at.slice(0, 10) : p.date,
    }));
    // Re-seed the interactions the AI just materialised, so their [ask:id] tags
    // resolve in the editor straight away instead of showing as invalid refs.
    if (s.interactions) setInteractions(s.interactions);
    setOpen((o) => ({ ...o, article: true }));
  }

  // Only recompute the (deep) comparison when a side actually changes, not on
  // every render.
  const dirty = useMemo(
    () => JSON.stringify(post) !== JSON.stringify(savedSnapshot),
    [post, savedSnapshot],
  );
  useBeforeUnload(dirty || notesDirty);

  const canPublish = Boolean(post.title.trim() && post.trip_id);
  const readMin = Math.max(1, Math.round(post.body.split(/\s+/).filter(Boolean).length / 200));

  const photoIds = useMemo(() => photos.map((p) => p.id), [photos]);
  const interactionIds = useMemo(() => interactions.map((i) => i.id), [interactions]);

  return (
    <div className="space-y-3 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-white/10 bg-ink-900/50 px-3.5 py-2.5">
        <TranslationBadge postId={postId} initialStatus={translationStatus} published={post.published} />
        <button
          type="button"
          onClick={() => setProofreadOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-sand-100/80 transition hover:border-ember-400 hover:text-ember-400"
        >
          <SpellCheck className="size-3.5" />
          {t("admin.proofread.button")}
        </button>
      </div>

      <PostActionBar
        previewHref={`/admin/posts/${postId}/preview`}
        saving={busy}
        onSave={() => save(false)}
        published={post.published}
        canPublish={canPublish}
        onTogglePublish={togglePublish}
        statusLabel={post.published ? t("admin.editor.status.published") : t("admin.editor.status.unpublished")}
      />

      <p className="px-1 pt-1 text-xs uppercase tracking-[0.18em] text-sand-100/60">{t("admin.editor.group.setup")}</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <PostSection title={t("admin.editor.stage.trip")} icon={<MapIcon className="size-4" />} summary={trips.find((tr) => tr.id === post.trip_id)?.title} open={open.trip} onToggle={() => toggle("trip")} className={open.trip ? "lg:col-span-4" : undefined}>
          <TripStage value={post.trip_id} trips={trips} onChange={(id) => set("trip_id", id)} />
        </PostSection>
        <PostSection title={t("admin.editor.stage.track")} icon={<Route className="size-4" />} summary={trackCount ? t("admin.editor.status.track", { n: tracks.reduce((s, tr) => s + Math.round((tr.distance_m ?? 0) / 1000), 0) }) : t("admin.editor.status.trackNone")} open={open.track} onToggle={() => toggle("track")} className={open.track ? "lg:col-span-4" : undefined}>
          <TrackManager postId={postId} tripId={post.trip_id || null} slug={slug} initial={tracks} onCountChange={setTrackCount} onPhotosLocated={() => setPhotoRefreshKey((k) => k + 1)} />
        </PostSection>
        <PostSection title={t("admin.editor.stage.photos")} icon={<PhotoIcon className="size-4" />} summary={t(photos.length === 1 ? "admin.editor.status.photo" : "admin.editor.status.photos", { n: photos.length })} open={open.photos} onToggle={() => toggle("photos")} className={open.photos ? "lg:col-span-4" : undefined}>
          <PhotoManager postId={postId} slug={slug} initial={initialPhotos} initialManualOrder={initialPhotoManualOrder} onListChange={setPhotos} refreshKey={photoRefreshKey} tracks={tracks} />
        </PostSection>
        <PostSection title={t("admin.editor.stage.polls")} icon={<MessageCircle className="size-4" />} summary={t("admin.editor.status.polls", { n: interactions.length })} open={open.polls} onToggle={() => toggle("polls")} className={open.polls ? "lg:col-span-4" : undefined}>
          <InteractionManager postId={postId} slug={slug} list={interactions} onListChange={setInteractions} />
        </PostSection>
      </div>

      <p className="px-1 pt-2 text-xs uppercase tracking-[0.18em] text-sand-100/60">{t("admin.editor.group.compose")}</p>
      {aiConfigured && (
        <PostSection title={t("admin.editor.stage.ai")} icon={<Sparkles className="size-4" />} accent open={open.ai} onToggle={() => toggle("ai")}>
          <AiDraftPanel
            postId={postId}
            initialNotes={initialNotes}
            hasBody={Boolean(post.body)}
            hasCaptions={photos.some((p) => (p.caption ?? "").trim() !== "")}
            onDraftSaved={handleDraftSaved}
            onPhotosUpdated={() => setPhotoRefreshKey((k) => k + 1)}
            onNotesDirty={setNotesDirty}
            onBeforeGenerate={async () => {
              await save(false);
            }}
          />
        </PostSection>
      )}
      <PostSection title={t("admin.editor.stage.article")} icon={<FileText className="size-4" />} summary={post.body.trim() ? t("admin.editor.status.draft", { n: readMin }) : t("admin.editor.status.empty")} open={open.article} onToggle={() => toggle("article")}>
        <ArticleStage
          title={post.title}
          body={post.body}
          photos={photos}
          interactions={interactions}
          photoIds={photoIds}
          interactionIds={interactionIds}
          onTitleChange={(v) => set("title", v)}
          onBodyChange={(v) => set("body", v)}
        />
      </PostSection>

      <p className="px-1 pt-2 text-xs uppercase tracking-[0.18em] text-sand-100/60">{t("admin.editor.group.finish")}</p>
      <PostSection title={t("admin.editor.stage.details")} icon={<SlidersHorizontal className="size-4" />} open={open.details} onToggle={() => toggle("details")}>
        <DetailsStage
          cover_image={post.cover_image}
          cover_alt={post.cover_alt}
          location={post.location}
          lat={post.lat}
          lng={post.lng}
          date={post.date}
          excerpt={post.excerpt}
          photos={photos}
          onField={(k, v) => set(k, v)}
          onLatLng={(la, ln) => setPost((p) => ({ ...p, lat: la, lng: ln }))}
        />
      </PostSection>

      {error && <p className="px-1 text-sm text-red-400">{error}</p>}

      {post.id && (
        <div className="pt-2">
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-red-500/30 px-4 py-2 text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <Trash2 className="size-4" /> {t("admin.editor.delete")}
          </button>
        </div>
      )}

      <ProofreadDialog
        open={proofreadOpen}
        onClose={() => setProofreadOpen(false)}
        postId={postId}
        lang="de"
        title={post.title}
        excerpt={post.excerpt ?? ""}
        body={post.body ?? ""}
        onApply={(field, value) => set(field, value)}
        onRan={(c) => setProofreadSig(proofreadSignature(c.title, c.excerpt, c.body))}
      />
    </div>
  );
}
