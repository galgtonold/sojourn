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

// Append a dictated chunk to the existing text with sane spacing.
export function appendTranscript(existing: string, chunk: string): string {
  const c = chunk.trim();
  if (!c) return existing;
  if (!existing) return c;
  return existing + (/\s$/.test(existing) ? "" : " ") + c;
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

export type Dictation = {
  supported: boolean;
  listening: boolean;
  interim: string;
  denied: boolean;
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
  const [denied, setDenied] = useState(false);
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
  // The finalized text emitted so far in the current session — our own position
  // in the accumulating results list (see growthFrom). Reset in start().
  const emittedRef = useRef("");

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
    setDenied(false);
    wantRef.current = true;
    emittedRef.current = "";
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
      const emitted = emittedRef.current;
      const { delta, finalText, interim } = growthFrom(results, emitted);
      dlog(
        "onresult h" + hookId,
        "ri=" + e.resultIndex,
        "n=" + results.length,
        results.map((r, i) => i + (r.isFinal ? "F" : "i")).join(","),
        "emittedLen=" + emitted.length,
        "final=" + JSON.stringify(finalText),
        "delta=" + JSON.stringify(delta),
      );
      // Always advance: growthFrom diffs from the common prefix, so the position
      // is simply "everything finalized so far", revision or not. Conditioning
      // this on startsWith is what froze it.
      emittedRef.current = finalText;
      if (delta.trim()) {
        dlog("EMIT h" + hookId, JSON.stringify(delta));
        onFinalRef.current(delta);
      }
      setInterim(interim);
    };
    rec.onerror = (e) => {
      dlog("onerror h" + hookId, e.error);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setDenied(true);
      }
      // Other errors (no-speech, aborted, network) just end the session via onend.
    };
    rec.onend = () => {
      dlog("onend h" + hookId);
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
  useEffect(
    () => () => {
      wantRef.current = false;
      recRef.current?.abort();
    },
    [],
  );

  return { supported, listening, interim, denied, toggle, stop };
}
