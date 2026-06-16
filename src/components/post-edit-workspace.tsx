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
  const [editorInitial, setEditorInitial] = useState(initial);
  const [version, setVersion] = useState(0);
  const editorRef = useRef<PostEditorHandle>(null);

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
            onBeforeGenerate={async () => {
              // Persist the editor's current fields (e.g. an edited or cleared
              // location) so the AI generates from what the author sees now,
              // not the last-saved draft.
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
      />
    </>
  );
}
