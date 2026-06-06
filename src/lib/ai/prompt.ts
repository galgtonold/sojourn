export type Lang = "de" | "en";

export function langInstruction(lang: Lang): string {
  return lang === "en"
    ? "Write everything in English."
    : "Schreibe alles auf Deutsch.";
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
