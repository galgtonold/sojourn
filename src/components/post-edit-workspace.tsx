"use client";
import { useRef, useState } from "react";
import {
  AiDraftPanel,
  type DraftSaved,
} from "@/components/ai-draft-panel";
import {
  PostEditor,
  type EditablePost,
  type PostEditorHandle,
} from "@/components/post-editor";
import { Select } from "@/components/select";
import { useT } from "@/components/i18n";
import type { Photo } from "@/lib/types";

/**
 * Owns the editable-post state so the AI draft panel and the editor stay in
 * sync. When generation finishes, the panel hands back exactly what was
 * persisted and we re-seed the editor immediately (remounting it via the
 * version key) — so hitting "publish" right after generating can never PUT the
 * stale, pre-generation draft over the freshly written one.
 */
export function PostEditWorkspace({
  postId,
  initial,
  initialNotes,
  aiConfigured,
  trips,
  photos,
  photoIds,
  interactionIds,
}: {
  postId: string;
  initial: EditablePost;
  initialNotes: string;
  aiConfigured: boolean;
  trips: { id: string; title: string }[];
  photos: Photo[];
  photoIds: string[];
  interactionIds: string[];
}) {
  const t = useT();
  const [editorInitial, setEditorInitial] = useState(initial);
  const [version, setVersion] = useState(0);
  // Trip is lifted here (above the AI panel) when AI is on, so its context is
  // chosen before generation; the editor then renders it controlled.
  const [tripId, setTripId] = useState(initial.trip_id);
  const editorRef = useRef<PostEditorHandle>(null);

  const fieldStyle =
    "w-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm outline-none focus:border-ember-400";

  function handleDraftSaved(s: DraftSaved) {
    setEditorInitial((p) => ({
      ...p,
      title: s.title ?? p.title,
      excerpt: s.excerpt ?? "",
      body: s.body ?? "",
      location: s.location ?? "",
      cover_image: s.cover_image ?? p.cover_image,
      lat: s.lat != null ? String(s.lat) : p.lat,
      lng: s.lng != null ? String(s.lng) : p.lng,
    }));
    setVersion((v) => v + 1);
  }

  return (
    <>
      {aiConfigured && (
        <div className="mb-8 space-y-4">
          {/* Trip first: its context feeds the generation below. */}
          <label className="block text-sm text-sand-100/60">
            {t("admin.editor.trip")}
            {trips.length > 0 ? (
              <Select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                className={fieldStyle}
                wrapperClassName="mt-1"
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
              </Select>
            ) : (
              <p className="mt-1 rounded-xl border border-ember-500/30 bg-ember-500/10 px-3 py-2.5 text-sm text-ember-200">
                {t("admin.editor.tripRequiredNoTrips")}
              </p>
            )}
            <span className="mt-1 block text-xs text-sand-100/40">
              {t("admin.editor.tripContextHint")}
            </span>
          </label>

          <AiDraftPanel
            postId={postId}
            initialNotes={initialNotes}
            hasBody={Boolean(editorInitial.body)}
            onDraftSaved={handleDraftSaved}
            onBeforeGenerate={async () => {
              // Persist the editor's current fields (e.g. an edited or cleared
              // location, and the trip picked above) so the AI generates from
              // what the author sees now, not the last-saved draft.
              await editorRef.current?.save();
            }}
          />
        </div>
      )}

      <PostEditor
        key={version}
        ref={editorRef}
        initial={editorInitial}
        trips={trips}
        photos={photos}
        photoIds={photoIds}
        interactionIds={interactionIds}
        {...(aiConfigured ? { tripId, onTripChange: setTripId } : {})}
      />
    </>
  );
}
