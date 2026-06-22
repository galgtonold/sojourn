// Pure segment model for the inline-chip story editor. The post `body` markdown
// string stays the single source of truth; this maps it to render-segments (what
// the contentEditable draws) and serializes the editor's segments back to
// markdown. Reuses editorBlocks so the editor and the public renderer never
// diverge. No DOM here — the component does the thin DOM walking.
import type { Photo } from "@/lib/types";
import { editorBlocks, type EditorInteraction } from "@/lib/story-editor";

// What the editor renders for each piece of the body.
export type RenderSegment =
  | { kind: "text"; text: string }
  | {
      kind: "chip";
      // The EXACT source substring this chip stands for, so serialization round
      // trips losslessly (e.g. an index ref [photo:1] is preserved verbatim).
      token: string;
      chipKind: "photo" | "poll" | "quiz" | "broken";
      label: string;
      thumb: string | null; // raw photo url; the component sizes it
    };

// What the editor serializes back out of the DOM, before joining to markdown.
export type Segment =
  | { type: "text"; text: string }
  | { type: "token"; token: string };

export function renderSegments(
  body: string,
  photos: Photo[],
  interactions: EditorInteraction[],
): RenderSegment[] {
  return editorBlocks(body, photos, interactions).map((b) => {
    if (b.kind === "prose") return { kind: "text", text: b.text };
    const token = body.slice(b.start, b.end);
    if (b.kind === "photo")
      return {
        kind: "chip",
        token,
        chipKind: "photo",
        label: b.photo.caption ?? "",
        thumb: b.photo.url ?? null,
      };
    if (b.kind === "interaction")
      return {
        kind: "chip",
        token,
        chipKind: b.interaction.kind,
        label: b.interaction.question,
        thumb: null,
      };
    if (b.kind === "pending")
      return {
        kind: "chip",
        token,
        chipKind: b.spec.kind,
        label: b.spec.question,
        thumb: null,
      };
    return { kind: "chip", token, chipKind: "broken", label: b.ref, thumb: null };
  });
}

export function segmentsToBody(segments: Segment[]): string {
  return segments.map((s) => (s.type === "text" ? s.text : s.token)).join("");
}
