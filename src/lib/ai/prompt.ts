export type Lang = "de" | "en";

export function langInstruction(lang: Lang): string {
  return lang === "en"
    ? "Write everything in English."
    : "Schreibe alles auf Deutsch.";
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
    (kind === "quiz"
      ? "- Das «=» markiert die einzige richtige Option; sie muss durch das Material gedeckt sein. Insgesamt 2–4 Optionen.\n"
      : "- Eine Umfrage hat keine richtige Antwort. 2–4 Meinungs-Optionen.\n") +
    `- Thema: ${idea}`
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
