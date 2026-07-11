export type Lang = "de" | "en";

export function langInstruction(lang: Lang): string {
  // The source material (photo descriptions, place names) is often in English,
  // which tends to drag short fields — title, excerpt, headings — into English
  // even when the body comes out right. Be emphatic that EVERYTHING the model
  // emits is in the target language regardless of the material's language.
  return lang === "en"
    ? "Write EVERYTHING in English — the title, the excerpt, every heading and " +
        "the body. Some source material (e.g. photo descriptions) may be in " +
        "another language; render its meaning in English, never copy it verbatim."
    : "Schreibe ALLES auf Deutsch — Titel, Beschreibung, jede Überschrift und " +
        "den Fließtext. Ein Teil des Materials (z. B. Fotobeschreibungen) ist " +
        "auf Englisch; gib den Inhalt sinngemäß auf Deutsch wieder, übernimm ihn " +
        "niemals wörtlich auf Englisch.";
}

// Instructions for embedding ONE poll/quiz using the inline :::block syntax.
export function interactionInstruction(
  kind: "poll" | "quiz",
  idea: string,
  lang: Lang,
): string {
  if (lang === "en") {
    const ex =
      kind === "quiz"
        ? ":::quiz How high is the summit?\n- 3000 m\n- = 4158 m\n- 5000 m\n> One sentence revealed after answering.\n:::"
        : ":::poll Which pass would you tackle first?\n- Gemmi Pass\n- Furka Pass\n- Susten Pass\n:::";
    return (
      `\n- Add exactly ONE ${kind} at a natural point in this section, on its own ` +
      `lines, using this syntax (blank line before and after):\n${ex}\n` +
      `- Output it ONLY as this fenced ::: block — NEVER as a prose paragraph, a ` +
      `rhetorical question in the text, or a bullet list. The block must be ` +
      `complete: the «:::${kind}» opener, the options, and the closing «:::».\n` +
      (kind === "quiz"
        ? "- The «=» marks the single correct option; it must be supported by the material. Add 2–4 options total.\n"
        : "- A poll has no correct answer. Add 2–4 opinion options.\n") +
      `- Topic: ${idea}`
    );
  }
  const ex =
    kind === "quiz"
      ? ":::quiz Wie hoch ist der Gipfel?\n- 3000 m\n- = 4158 m\n- 5000 m\n> Ein Satz, der nach der Antwort erscheint.\n:::"
      : ":::poll Welchen Pass würdest du zuerst angehen?\n- Gemmipass\n- Furkapass\n- Sustenpass\n:::";
  return (
    `\n- Füge GENAU EINE ${kind === "quiz" ? "Quizfrage" : "Umfrage"} an einer ` +
    `passenden Stelle dieses Abschnitts ein, in eigenen Zeilen, mit dieser ` +
    `Syntax (Leerzeile davor und danach):\n${ex}\n` +
    `- Gib sie AUSSCHLIESSLICH als diesen :::-Block aus – NIEMALS als Fließtext, ` +
    `als rhetorische Frage im Text oder als Aufzählung. Der Block muss vollständig ` +
    `sein: Eröffnung «:::${kind === "quiz" ? "quiz" : "poll"}», die Optionen und der ` +
    `abschließende «:::».\n` +
    (kind === "quiz"
      ? "- Das «=» markiert die einzige richtige Option; sie muss durch das Material gedeckt sein. Insgesamt 2–4 Optionen.\n"
      : "- Eine Umfrage hat keine richtige Antwort. 2–4 Meinungs-Optionen.\n") +
    `- Thema: ${idea}`
  );
}

// Instructions for placing the author's PRE-DEFINED interactions into a section.
// The poll/quiz already exists — the model only positions it, by emitting the
// exact [ask:<id>] tag. It must never spell out the options or the answer, nor
// rebuild it as a :::block.
export function predefinedInteractionInstruction(
  items: { id: string; kind: "poll" | "quiz"; question: string }[],
  lang: Lang,
): string {
  if (items.length === 0) return "";
  const label = (kind: "poll" | "quiz") =>
    lang === "en"
      ? kind === "quiz"
        ? "quiz"
        : "poll"
      : kind === "quiz"
        ? "Quiz"
        : "Umfrage";
  const list = items
    .map((it) => `[ask:${it.id}] (${label(it.kind)}): "${it.question}"`)
    .join("\n");
  if (lang === "en") {
    return (
      `\n- The author prepared the following reader interaction(s) for THIS ` +
      `section. Place EACH at a natural spot, as the exact tag [ask:<id>] on its ` +
      `own line (blank line before and after). Lead in with a short sentence, but ` +
      `do NOT write the options or the answer into the prose and do NOT rebuild ` +
      `it as a :::block:\n${list}`
    );
  }
  return (
    `\n- Der Autor hat für DIESEN Abschnitt die folgende(n) Leser-Interaktion(en) ` +
    `vorbereitet. Platziere JEDE an einer natürlichen Stelle, als exakten Tag ` +
    `[ask:<id>] in einer eigenen Zeile (Leerzeile davor und danach). Leite mit ` +
    `einem kurzen Satz darauf hin, aber schreibe die Optionen oder die Antwort ` +
    `NICHT in den Fließtext und baue daraus KEINEN :::-Block:\n${list}`
  );
}

export function qaBlock(
  answers: { question: string; answer: string }[] | undefined,
  lang: Lang,
): string {
  const filled = (answers ?? []).filter((a) => a.answer.trim());
  if (filled.length === 0) return "";
  const header = lang === "en" ? "Author's answers:" : "Antworten des Autors:";
  return (
    `\n\n${header}\n` +
    filled.map((a) => `F: ${a.question}\nA: ${a.answer}`).join("\n\n")
  );
}

// The "story so far" continuity brief, wrapped for the outline / section prompt.
// Empty in → empty out (day 1 and best-effort failures pass "").
export function continuityBlock(brief: string): string {
  const b = brief.trim();
  if (!b) return "";
  return (
    "Bisher auf dieser Reise (Kontinuität — beziehe dich natürlich darauf, wo es " +
    "passt; wiederhole es NICHT wie neu und erfinde keine Auflösung):\n" +
    b
  );
}
