"use client";
import { useState } from "react";
import {
  AiDraftPanel,
  type DraftSaved,
} from "@/components/ai-draft-panel";
import { PostEditor, type EditablePost } from "@/components/post-editor";

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
  photoIds,
  interactionIds,
}: {
  postId: string;
  initial: EditablePost;
  initialNotes: string;
  aiConfigured: boolean;
  trips: { id: string; title: string }[];
  photoIds: string[];
  interactionIds: string[];
}) {
  const [editorInitial, setEditorInitial] = useState(initial);
  const [version, setVersion] = useState(0);

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
        <div className="mb-8">
          <AiDraftPanel
            postId={postId}
            initialNotes={initialNotes}
            hasBody={Boolean(editorInitial.body)}
            onDraftSaved={handleDraftSaved}
          />
        </div>
      )}

      <PostEditor
        key={version}
        initial={editorInitial}
        trips={trips}
        photoIds={photoIds}
        interactionIds={interactionIds}
      />
    </>
  );
}
