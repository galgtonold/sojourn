"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { optimizedSrc } from "@/lib/utils";
import { useT } from "@/components/i18n";
import {
  renderSegments,
  segmentsToBody,
  type RenderSegment,
  type Segment,
} from "@/lib/inline-editor";
import type { Photo } from "@/lib/types";
import type { EditorInteraction } from "@/lib/story-editor";

export type InlineEditorHandle = { insertToken: (token: string) => void };

// Static, safe icon markup for non-photo chips (set via innerHTML — no user data).
const POLL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/></svg>`;
const ALERT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;

type ChipSeg = Extract<RenderSegment, { kind: "chip" }>;

function makeChip(seg: ChipSeg, removeLabel: string): HTMLElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.token = seg.token;
  const broken = seg.chipKind === "broken";
  chip.className = [
    "mx-0.5 inline-flex max-w-[14rem] select-none items-center gap-1 rounded-md px-1.5 py-0.5 align-middle text-xs ring-1",
    broken
      ? "bg-red-500/10 text-red-300 ring-red-500/40"
      : "bg-ember-500/15 text-sand-50 ring-ember-400/30",
  ].join(" ");

  if (seg.chipKind === "photo" && seg.thumb) {
    const img = document.createElement("img");
    img.src = optimizedSrc(seg.thumb, 48, 48);
    img.alt = "";
    img.className = "size-4 shrink-0 rounded object-cover";
    chip.appendChild(img);
  } else {
    const icon = document.createElement("span");
    icon.className = broken ? "shrink-0 text-red-300" : "shrink-0 text-ember-300";
    icon.innerHTML = broken ? ALERT_SVG : POLL_SVG;
    chip.appendChild(icon);
  }

  const label = document.createElement("span");
  label.className = "truncate";
  label.textContent = seg.label || (seg.chipKind === "photo" ? "" : seg.token);
  chip.appendChild(label);

  const rm = document.createElement("button");
  rm.type = "button";
  rm.dataset.remove = "1";
  rm.tabIndex = -1;
  rm.setAttribute("aria-label", removeLabel);
  rm.className = "ml-0.5 shrink-0 leading-none opacity-50 transition hover:opacity-100";
  rm.textContent = "×";
  chip.appendChild(rm);

  return chip;
}

// Walk a contentEditable subtree (or a cloned fragment) back into markdown. Text
// nodes carry prose; chip spans carry their exact source token; <br> is a
// newline; any other wrapper the browser inserts is unwrapped.
function serialize(root: Node): string {
  const segs: Segment[] = [];
  const pushText = (s: string) => {
    if (!s) return;
    const last = segs[segs.length - 1];
    if (last && last.type === "text") last.text += s;
    else segs.push({ type: "text", text: s });
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        pushText(child.textContent ?? "");
      } else if (child instanceof HTMLElement) {
        if (child.dataset.token != null) segs.push({ type: "token", token: child.dataset.token });
        else if (child.tagName === "BR") pushText("\n");
        else walk(child);
      }
    });
  };
  walk(root);
  return segmentsToBody(segs);
}

/**
 * One inline editing surface: prose is plain markdown text; [photo:id] / [ask:id]
 * / well-formed :::poll render as small inline chips. The body markdown string is
 * the source of truth — the contentEditable is uncontrolled and rebuilt only on
 * external body changes; user edits serialize back out via the `input` event.
 */
export const InlineEditor = forwardRef<
  InlineEditorHandle,
  {
    body: string;
    onChange: (body: string) => void;
    photos: Photo[];
    interactions: EditorInteraction[];
    placeholder?: string;
  }
>(function InlineEditor({ body, onChange, photos, interactions, placeholder }, ref) {
  const t = useT();
  const elRef = useRef<HTMLDivElement>(null);
  // Sentinel (no real body equals it) so the first effect run always builds.
  const lastSerialized = useRef<string>(" __unbuilt__");
  const savedRange = useRef<Range | null>(null);
  const removeLabel = t("admin.editor.removeObject");
  // Our manual DOM edits bypass the browser's native undo stack, so we keep our
  // own history of body snapshots and intercept Ctrl/Cmd+Z (see onKeyDown).
  const history = useRef<{ stack: string[]; index: number; t: number }>({
    stack: [body],
    index: 0,
    t: 0,
  });

  const build = (value: string) => {
    const el = elRef.current;
    if (!el) return;
    el.textContent = "";
    for (const s of renderSegments(value, photos, interactions)) {
      if (s.kind === "text") el.appendChild(document.createTextNode(s.text));
      else el.appendChild(makeChip(s, removeLabel));
    }
    lastSerialized.current = value;
  };

  // Rebuild the DOM on an external body change (mount, AI reseed) — our own edits
  // set lastSerialized first, so the echoed prop is a no-op and the caret stays.
  // Also re-skin the chips when photos/interactions change while the editor is in
  // sync (e.g. a poll defined or edited in the builder above): that only happens
  // with focus in a manager elsewhere, so resetting the editor caret is fine.
  const prevSkin = useRef({ photos, interactions });
  useEffect(() => {
    const skinChanged =
      prevSkin.current.photos !== photos ||
      prevSkin.current.interactions !== interactions;
    prevSkin.current = { photos, interactions };
    if (body !== lastSerialized.current || skinChanged) build(body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, photos, interactions]);

  // Remember the caret while focus is in the editor, so the insert bar — which
  // takes focus when clicked — can drop a chip where the author last was.
  useEffect(() => {
    const onSel = () => {
      const el = elRef.current;
      const sel = window.getSelection();
      if (el && sel && sel.rangeCount && el.contains(sel.anchorNode)) {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      }
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  // Record a new body snapshot. Rapid typing coalesces into one undo step;
  // structural edits (insert/delete/paste) pass coalesce=false for a discrete one.
  const record = (next: string, coalesce: boolean) => {
    const h = history.current;
    if (h.stack[h.index] === next) return;
    if (h.index < h.stack.length - 1) h.stack = h.stack.slice(0, h.index + 1);
    const now = Date.now();
    if (coalesce && now - h.t < 600 && h.stack.length > 1) {
      h.stack[h.stack.length - 1] = next;
    } else {
      h.stack.push(next);
      if (h.stack.length > 300) h.stack.shift();
    }
    h.index = h.stack.length - 1;
    h.t = now;
  };

  const emit = (coalesce = true) => {
    const el = elRef.current;
    if (!el) return;
    const md = serialize(el);
    lastSerialized.current = md;
    record(md, coalesce);
    onChange(md);
  };

  // Restore a snapshot: rebuild the DOM, sync the parent, caret to the end.
  const applyHistory = (value: string) => {
    build(value);
    onChange(value);
    const el = elRef.current;
    const sel = window.getSelection();
    if (el && sel) {
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      savedRange.current = r.cloneRange();
    }
  };
  const undo = () => {
    const h = history.current;
    if (h.index <= 0) return;
    h.index -= 1;
    applyHistory(h.stack[h.index]);
  };
  const redo = () => {
    const h = history.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1;
    applyHistory(h.stack[h.index]);
  };

  // Place the caret in a collapsed range just after `node`.
  const caretAfter = (node: Node) => {
    const sel = window.getSelection();
    const after = document.createTextNode("");
    node.parentNode?.insertBefore(after, node.nextSibling);
    const r = document.createRange();
    r.setStart(after, 0);
    r.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(r);
    savedRange.current = r.cloneRange();
  };

  useImperativeHandle(ref, () => ({
    insertToken(token) {
      const el = elRef.current;
      if (!el) return;
      el.focus();
      let range = savedRange.current;
      if (!range || !el.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
      }
      range.deleteContents();
      const seg = renderSegments(token, photos, interactions).find(
        (s): s is ChipSeg => s.kind === "chip",
      );
      const node: Node = seg
        ? makeChip(seg, removeLabel)
        : document.createTextNode(token);
      range.insertNode(node);
      caretAfter(node);
      emit(false);
    },
  }));

  const onKeyDown = (e: KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && (e.key === "y" || e.key === "Y")) {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Enter") {
      // Insert a <br> ourselves so the browser never wraps lines in <div>/<p>
      // (which would break the flat text-node + chip serialization).
      e.preventDefault();
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const br = document.createElement("br");
      range.insertNode(br);
      caretAfter(br);
      emit(false);
    }
  };

  const onClickEditor = (e: MouseEvent) => {
    const rm = (e.target as HTMLElement).closest("[data-remove]");
    if (rm) {
      e.preventDefault();
      rm.closest("[data-token]")?.remove();
      emit(false);
    }
  };

  const onCopyCut = (e: ClipboardEvent, cut: boolean) => {
    const sel = window.getSelection();
    const el = elRef.current;
    if (!sel || sel.isCollapsed || !sel.rangeCount || !el) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", serialize(range.cloneContents()));
    if (cut) {
      range.deleteContents();
      emit(false);
    }
  };

  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const el = elRef.current;
    const sel = window.getSelection();
    if (!text || !el || !sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    // Re-translate: serialize the result and rebuild so any pasted [photo:]/
    // [ask:] tokens render as chips. The caret lands at the document end.
    const md = serialize(el);
    build(md);
    record(md, false);
    onChange(md);
    const end = document.createRange();
    end.selectNodeContents(el);
    end.collapse(false);
    sel.removeAllRanges();
    sel.addRange(end);
    savedRange.current = end.cloneRange();
  };

  return (
    <div className="relative">
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        spellCheck={false}
        onInput={() => emit(true)}
        onKeyDown={onKeyDown}
        onClick={onClickEditor}
        onCopy={(e) => onCopyCut(e, false)}
        onCut={(e) => onCopyCut(e, true)}
        onPaste={onPaste}
        className="min-h-[14rem] w-full whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-ink-800 px-3 py-2.5 text-sm leading-relaxed outline-none focus:border-ember-400"
      />
      {body.trim() === "" && (
        <p className="pointer-events-none absolute left-3 top-2.5 text-sm text-sand-100/40">
          {placeholder}
        </p>
      )}
    </div>
  );
});
