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

// Append-time de-dup for continuous dictation. Given all the text emitted so far
// (`committed`) and a recognition session's finalized text (`session`), return
// only the part of `session` that isn't already at the TAIL of `committed`: it
// finds the longest suffix of `committed` that is a prefix of `session` and
// returns what follows. This absorbs every doubling mechanism at the text level —
// a session re-delivering its own results, a restart re-recognizing trailing
// audio (…MikrofonMikrofon), or two overlapping recognizers — because the
// overlapping prefix is dropped and only genuinely new speech is returned. The
// one accepted trade-off: re-speaking the exact same phrase back-to-back collapses
// to one. Pure, so the de-dup is tested without a browser.
export function appendDelta(committed: string, session: string): string {
  if (!session) return "";
  const max = Math.min(committed.length, session.length);
  for (let k = max; k > 0; k--) {
    if (committed.endsWith(session.slice(0, k))) return session.slice(k);
  }
  return session;
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
  // All recognized text emitted so far in THIS listening period (across recognizer
  // sessions). New session text is de-duped against its tail (see appendDelta), so
  // re-emitted or re-captured audio never doubles. Reset only in start().
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

  // Start ONE recognition session on a fresh SpeechRecognition instance. Chrome
  // ends a session after a silence; `onend` starts another while still wanted, so
  // continuous dictation survives pauses. De-dup lives in onresult (appendDelta
  // against the running committed text), so a restart that re-captures trailing
  // audio — or a session that re-delivers results — can never double the text.
  const startSession = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
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
      const { finalText, interim } = sessionTranscript(results);
      // Append only what isn't already at the tail of everything dictated so far.
      const delta = appendDelta(committedRef.current, finalText);
      if (delta.trim()) {
        committedRef.current += delta;
        onFinalRef.current(delta);
      }
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
    committedRef.current = ""; // fresh dictation period
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
