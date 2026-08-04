"use client";
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal shape of the browser SpeechRecognition API — the DOM lib's types are
// incomplete/experimental, so we declare only what this hook uses.
type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative };
type RecognitionEvent = {
  resultIndex: number;
  results: { length: number } & Record<number, RecognitionResult>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Diagnostics for the recognition event stream, OFF unless asked for.
//
// This used to be a hard-coded `true`, which meant every author's dictated words
// were printed to their console in production — the transcript, verbatim, on a
// personal journal. It is also the only way to debug this API, which behaves
// differently on every browser and cannot be reproduced in a test.
//
// So: opt in per browser, on any deployment, and it survives a reload.
//   localStorage.dictDebug = "1"    (or load the page with ?dictdebug=1)
function dictDebug(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).has("dictdebug")) {
      window.localStorage.setItem("dictDebug", "1");
    }
    return window.localStorage.getItem("dictDebug") === "1";
  } catch {
    // Storage can throw in a locked-down browser; never take dictation down
    // over a logging switch.
    return false;
  }
}
let __dictHooks = 0;
function dlog(...args: unknown[]) {
  if (dictDebug() && typeof console !== "undefined") console.log("[dict]", ...args);
}

/**
 * Insert a dictated chunk at a caret position, with the spacing a person would
 * have typed, and report where the caret ends up.
 *
 * Dictation used to always append to the very end of the notes. That is right
 * often enough to hide how wrong it is the rest of the time: put the cursor in
 * the middle of what you have written, speak, and the words land somewhere you
 * are not looking. Pure, so the spacing rules are pinned by tests rather than
 * discovered while talking to a microphone.
 */
export function insertTranscript(
  existing: string,
  chunk: string,
  at: number,
): { text: string; caret: number } {
  const c = chunk.trim();
  if (!c) return { text: existing, caret: at };

  const pos = Math.max(0, Math.min(at, existing.length));
  const before = existing.slice(0, pos);
  const after = existing.slice(pos);

  // A space before unless we are at the start or already after whitespace.
  const lead = before && !/\s$/.test(before) ? " " : "";
  // A space after only when something follows that would otherwise be glued on.
  // Punctuation is excluded: dictating into "…the hill." must not become
  // "…the hill ." when the caret sat before the full stop.
  const trail = after && !/^[\s.,;:!?)\]}»"']/.test(after) ? " " : "";

  return {
    text: before + lead + c + trail + after,
    caret: before.length + lead.length + c.length,
  };
}

// From the CUMULATIVE results of the current recognition session and the
// finalized text we've already emitted, return the new finalized growth to
// append plus the live interim.
//
// Why growth and not `resultIndex`: the results list re-sends every finalized
// chunk on every event, and Chrome's `resultIndex` does NOT reliably advance
// past finalized results — reading it re-appends the earlier chunks on each event
// (the first words double while the last stay fine). So we track our own position
// by the finalized text emitted so far and append only what extends it. Pure.
//
// It diffs from the COMMON PREFIX rather than requiring that the new text start
// with the old. The stricter version deadlocked: browsers sometimes revise an
// already-finalized chunk — re-punctuating it, or changing its capitalisation —
// and after one such revision `startsWith` was false forever, so the position
// never advanced and not one further word was ever emitted. Silence, with the
// microphone still showing as live. Diffing from the common prefix costs a
// re-emitted tail on the rare revision and cannot get stuck.
export function growthFrom(
  results: { transcript: string; isFinal: boolean }[],
  emitted: string,
): { delta: string; finalText: string; interim: string } {
  let finalText = "";
  let interim = "";
  for (const r of results) {
    if (r.isFinal) finalText += r.transcript;
    else interim += r.transcript;
  }
  let i = 0;
  while (i < emitted.length && i < finalText.length && emitted[i] === finalText[i]) {
    i++;
  }
  return { delta: finalText.slice(i), finalText, interim };
}

/**
 * What we know about the recognition session currently running: the finalized
 * text committed so far (our position in the accumulating results list) and the
 * text the browser is still showing as provisional.
 */
export type Session = { emitted: string; interim: string };

export function startSession(): Session {
  return { emitted: "", interim: "" };
}

/**
 * Fold one `result` event into the session. `emit` is the newly finalized text
 * to write into the document, empty when nothing new finalized.
 */
export function applyResult(
  s: Session,
  results: { transcript: string; isFinal: boolean }[],
): { session: Session; emit: string } {
  const { delta, finalText, interim } = growthFrom(results, s.emitted);
  return {
    session: { emitted: finalText, interim },
    emit: delta.trim() ? delta : "",
  };
}

/**
 * Fold the end of the session — and commit whatever it ended holding.
 *
 * The API only ever hands text over by marking a result final. If the session
 * ends first, the provisional text is gone from the browser for good: there is
 * no flush, no last event, no way to ask for it. Our `interim` is the only copy
 * left. It used to be dropped on the floor, so an utterance interrupted by a
 * dropped speech-service connection, an aborted stream, or the author tapping
 * the mic mid-word disappeared in front of them — words visibly typed out
 * beside the microphone, then nothing in the notes and no error to explain it.
 *
 * Normal endings cost nothing: the browser finalizes before it ends, which
 * empties `interim` on the last result event, so there is nothing here to
 * commit and no risk of writing a chunk twice.
 */
export function applyEnd(s: Session): { session: Session; emit: string } {
  return { session: startSession(), emit: s.interim.trim() };
}

/**
 * Why the microphone stopped, when it stopped for a reason worth saying.
 *
 * Every recognition error ends the session. Only a refused permission used to
 * be reported, so every other one — a dropped speech service, an unplugged
 * microphone, a language the browser will not dictate — looked identical from
 * the author's chair: the mic quietly stops mid-thought and nothing says why.
 */
export type DictationFault =
  | "denied"
  | "no-mic"
  | "network"
  | "no-speech"
  | "language"
  | "unknown";

/**
 * Map a `SpeechRecognitionErrorEvent.error` code onto something sayable.
 *
 * `null` means "do not say anything": `aborted` is the author pressing stop, or
 * the panel unmounting. Warning about that would teach them to ignore the
 * warnings that matter.
 *
 * `heardAnything` is why this takes a second argument. Chrome raises
 * `no-speech` for a long enough pause, including the one that ends a session
 * which transcribed fine — and "didn't catch anything" is simply false there.
 */
export function faultFrom(
  code: string,
  heardAnything = false,
): DictationFault | null {
  switch (code) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "denied";
    case "audio-capture":
      return "no-mic";
    case "network":
      return "network";
    case "no-speech":
      return heardAnything ? null : "no-speech";
    case "language-not-supported":
      return "language";
    default:
      return "unknown";
  }
}

export type Dictation = {
  supported: boolean;
  listening: boolean;
  interim: string;
  /** Why it stopped, or null while all is well. See DictationFault. */
  fault: DictationFault | null;
  toggle: () => void;
  stop: () => void;
};

export function useDictation(opts: {
  lang: string;
  onFinal: (text: string) => void;
}): Dictation {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [fault, setFault] = useState<DictationFault | null>(null);
  // A stable id per hook INSTANCE — if the logs show two different ids emitting,
  // the panel is mounting the hook twice (that would double the text).
  const [hookId] = useState(() => ++__dictHooks);

  // Refs so the API callbacks always read the latest values without re-binding.
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const langRef = useRef(opts.lang);
  langRef.current = opts.lang;
  const onFinalRef = useRef(opts.onFinal);
  onFinalRef.current = opts.onFinal;
  // The running session (see applyResult/applyEnd). Reset in start().
  const sessionRef = useRef<Session>(startSession());
  // Set when the component goes away mid-dictation: abort() still fires onend,
  // and there is no document left to commit the last words into.
  const goneRef = useRef(false);

  // Feature-detect after mount (not during render) so SSR and the first client
  // render agree — no hydration mismatch on the button's visibility.
  useEffect(() => setSupported(getCtor() !== null), []);

  // TEMP: log each hook instance's lifetime, to catch a double-mounted hook.
  useEffect(() => {
    dlog("hook MOUNT", hookId);
    return () => dlog("hook UNMOUNT", hookId);
  }, [hookId]);

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim("");
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setFault(null);
    wantRef.current = true;
    sessionRef.current = startSession();
    dlog("START", hookId, "existing rec?", !!recRef.current);
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const results: { transcript: string; isFinal: boolean }[] = [];
      for (let i = 0; i < e.results.length; i++) {
        results.push({
          transcript: e.results[i][0].transcript,
          isFinal: e.results[i].isFinal,
        });
      }
      const before = sessionRef.current;
      const { session, emit } = applyResult(before, results);
      dlog(
        "onresult h" + hookId,
        "ri=" + e.resultIndex,
        "n=" + results.length,
        results.map((r, i) => i + (r.isFinal ? "F" : "i")).join(","),
        "emittedLen=" + before.emitted.length,
        "final=" + JSON.stringify(session.emitted),
        "delta=" + JSON.stringify(emit),
        "interim=" + JSON.stringify(session.interim),
      );
      // Always advance: growthFrom diffs from the common prefix, so the position
      // is simply "everything finalized so far", revision or not. Conditioning
      // this on startsWith is what froze it.
      sessionRef.current = session;
      if (emit) {
        dlog("EMIT h" + hookId, JSON.stringify(emit));
        onFinalRef.current(emit);
      }
      setInterim(session.interim);
    };
    rec.onerror = (e) => {
      dlog("onerror h" + hookId, e.error);
      // Every error also ends the session, via onend — which is where the words
      // still in flight get committed. This only has to explain the silence.
      const s = sessionRef.current;
      setFault(faultFrom(e.error, !!(s.emitted.trim() || s.interim.trim())));
    };
    rec.onend = () => {
      // Commit anything the session ended holding, before the only copy of it
      // goes out of scope. See applyEnd — normal endings have nothing here.
      const { session, emit } = applyEnd(sessionRef.current);
      sessionRef.current = session;
      dlog("onend h" + hookId, "flush=" + JSON.stringify(emit));
      if (emit && !goneRef.current) onFinalRef.current(emit);
      // Do NOT auto-restart: restarting re-hears the buffered tail of the last
      // utterance and doubles it. The session ends on a longer silence; the author
      // taps the mic again to continue. (Short pauses stay in one session — Chrome
      // waits several seconds before ending.)
      wantRef.current = false;
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch (err) {
      dlog("start() threw h" + hookId, String(err));
      /* start() throws if already started — ignore */
    }
  }, [hookId]);

  const toggle = useCallback(() => {
    if (wantRef.current) stop();
    else start();
  }, [start, stop]);

  // Stop recognition if the component unmounts mid-dictation.
  useEffect(() => {
    // Cleared on (re)mount as well as set on unmount: StrictMode runs the
    // cleanup and then re-runs the effect on the same instance, and a ref that
    // stayed true would silently suppress every flush from then on.
    goneRef.current = false;
    return () => {
      wantRef.current = false;
      goneRef.current = true;
      recRef.current?.abort();
    };
  }, []);

  return { supported, listening, interim, fault, toggle, stop };
}
