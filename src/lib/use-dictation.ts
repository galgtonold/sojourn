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

// Append a dictated chunk to the existing text with sane spacing.
export function appendTranscript(existing: string, chunk: string): string {
  const c = chunk.trim();
  if (!c) return existing;
  if (!existing) return c;
  return existing + (/\s$/.test(existing) ? "" : " ") + c;
}

// From the cumulative results of ONE recognition session, the full finalized
// transcript and the live interim. Pure. `continuous` mode re-delivers the whole
// results list on every event, so the hook appends only the GROWTH of the
// finalized text (see newFinalDelta) — never the whole thing again.
export function sessionTranscript(
  results: { transcript: string; isFinal: boolean }[],
): { finalText: string; interim: string } {
  let finalText = "";
  let interim = "";
  for (const r of results) {
    if (r.isFinal) finalText += r.transcript;
    else interim += r.transcript;
  }
  return { finalText, interim };
}

// The newly-finalized text to append: the growth of a session's finalized
// transcript beyond what was already committed. Empty when nothing is new — so a
// re-delivered results list (or a session whose text we've already seen) never
// double-appends. Pure, so the de-dup is tested without a browser.
export function newFinalDelta(finalText: string, committed: string): string {
  return finalText.length > committed.length && finalText.startsWith(committed)
    ? finalText.slice(committed.length)
    : "";
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

  // Refs so the API callbacks always read the latest values without re-binding.
  const recRef = useRef<Recognition | null>(null);
  const wantRef = useRef(false);
  const langRef = useRef(opts.lang);
  langRef.current = opts.lang;
  const onFinalRef = useRef(opts.onFinal);
  onFinalRef.current = opts.onFinal;
  // The finalized transcript already appended for the CURRENT session. Reset when
  // a session starts, so each session's growth is tracked from scratch. Combined
  // with a fresh recognizer per session (see startSession), this is what stops
  // the earlier doubling, where a restart re-emitted the whole previous sentence.
  const committedRef = useRef("");

  // Feature-detect after mount (not during render) so SSR and the first client
  // render agree — no hydration mismatch on the button's visibility.
  useEffect(() => setSupported(getCtor() !== null), []);

  const stop = useCallback(() => {
    wantRef.current = false;
    setListening(false);
    setInterim("");
    recRef.current?.stop();
  }, []);

  // Start ONE recognition session on a FRESH SpeechRecognition instance. Chrome
  // ends a session after a silence; `onend` starts another fresh instance while
  // still wanted, so continuous dictation survives pauses. Crucially it does NOT
  // reuse the recognizer: a reused instance can keep its cumulative `results`
  // list across start() calls, which — with the per-session counter reset — made
  // every restart re-emit the already-spoken sentence (the doubling bug). A fresh
  // instance always starts with an empty results list.
  const startSession = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    committedRef.current = ""; // fresh instance → fresh (empty) results list
    rec.onresult = (e) => {
      const results: { transcript: string; isFinal: boolean }[] = [];
      for (let i = 0; i < e.results.length; i++) {
        results.push({
          transcript: e.results[i][0].transcript,
          isFinal: e.results[i].isFinal,
        });
      }
      const { finalText, interim } = sessionTranscript(results);
      const delta = newFinalDelta(finalText, committedRef.current);
      committedRef.current = finalText;
      if (delta.trim()) onFinalRef.current(delta);
      setInterim(interim);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantRef.current = false;
        setDenied(true);
        setListening(false);
        setInterim("");
      }
      // no-speech / aborted / network: let onend decide whether to restart.
    };
    rec.onend = () => {
      setInterim("");
      // Chrome ends a session after a silence; start a FRESH session while still
      // wanted so continuous dictation survives pauses.
      if (wantRef.current) {
        startSession();
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      /* start() throws if already started — ignore */
    }
  }, []);

  const start = useCallback(() => {
    if (!getCtor()) return;
    setDenied(false);
    wantRef.current = true;
    startSession();
    setListening(true);
  }, [startSession]);

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
