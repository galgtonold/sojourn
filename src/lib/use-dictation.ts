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

// From the cumulative SpeechRecognition results list, return the newly-finalized
// chunks (only those at an index >= `alreadyEmitted`), the live interim text, and
// the new high-water mark. `continuous` mode re-delivers the whole results list on
// every event and `resultIndex` isn't reliable across engines, so tracking a
// committed-count is what stops each final phrase being appended many times. Pure,
// so the de-dup is tested without a browser.
export function collectTranscript(
  results: { transcript: string; isFinal: boolean }[],
  alreadyEmitted: number,
): { finals: string[]; interim: string; emitted: number } {
  const finals: string[] = [];
  let interim = "";
  let emitted = alreadyEmitted;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.isFinal) {
      if (i >= alreadyEmitted) {
        finals.push(r.transcript);
        emitted = i + 1;
      }
    } else {
      interim += r.transcript;
    }
  }
  return { finals, interim, emitted };
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
  // How many results in the current session are already committed as final, so a
  // re-delivered cumulative results list never re-emits them (reset per session).
  const emittedRef = useRef(0);

  // Feature-detect after mount (not during render) so SSR and the first client
  // render agree — no hydration mismatch on the button's visibility.
  useEffect(() => setSupported(getCtor() !== null), []);

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
    emittedRef.current = 0; // fresh session → fresh results list
    const rec = new Ctor();
    rec.lang = langRef.current;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const results: { transcript: string; isFinal: boolean }[] = [];
      for (let i = 0; i < e.results.length; i++) {
        results.push({ transcript: e.results[i][0].transcript, isFinal: e.results[i].isFinal });
      }
      const { finals, interim, emitted } = collectTranscript(results, emittedRef.current);
      emittedRef.current = emitted;
      for (const f of finals) onFinalRef.current(f);
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
      // Chrome ends a session after a silence; restart while still wanted so
      // continuous dictation survives pauses.
      if (wantRef.current) {
        emittedRef.current = 0; // new session → results list restarts at 0
        try {
          rec.start();
        } catch {
          /* already (re)starting — ignore */
        }
      } else {
        setListening(false);
      }
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      /* start() throws if already started — ignore */
    }
  }, []);

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
