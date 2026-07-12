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

// The correct way to read a continuous SpeechRecognition event: `results` is
// cumulative, and `resultIndex` is the browser's pointer to the first result
// that is NEW or changed in THIS event. Iterating from there yields each
// finalized chunk exactly once — no matter whether the results list persists or
// resets across a restart — so nothing needs de-duping. Returns the newly
// finalized text (to append) and the current interim text. Pure.
export function collectFrom(
  results: { transcript: string; isFinal: boolean }[],
  resultIndex: number,
): { finals: string; interim: string } {
  let finals = "";
  let interim = "";
  for (let i = Math.max(0, resultIndex); i < results.length; i++) {
    const r = results[i];
    if (r.isFinal) finals += r.transcript;
    else interim += r.transcript;
  }
  return { finals, interim };
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
      // Append ONLY the results the browser flagged as new this event
      // (from resultIndex) — so a finalized phrase is emitted exactly once.
      const { finals, interim } = collectFrom(results, e.resultIndex);
      if (finals.trim()) onFinalRef.current(finals);
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
      // Chrome ends a session after a silence; restart the SAME recognizer while
      // still wanted so continuous dictation survives pauses. Reusing the
      // recognizer keeps `resultIndex` meaningful across the restart, so no chunk
      // is re-emitted.
      if (wantRef.current) {
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
