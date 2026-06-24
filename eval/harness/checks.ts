// eval/harness/checks.ts
import { validateBody } from "@/lib/interactions-parse";
import type { LoadedFixture } from "./fixture";

export type RunResult = {
  fixture: LoadedFixture;
  title: string;
  questions: string[];
  body: string;
  interactions: { id: string; kind: "poll" | "quiz"; options: string[]; correct_index: number | null }[];
  captions: { id: string; caption: string | null }[];
};

export type CheckResult = { name: string; pass: boolean; detail: string };

const NUM: Record<string, number> = { ein: 1, eine: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6 };

export function requestedQuizCount(ask: string | undefined): number | null {
  if (!ask) return null;
  const m = ask.toLowerCase().match(/quiz\s+mit\s+(\d+|ein|eine|zwei|drei|vier|fünf|sechs)\s+frage/);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : (NUM[m[1]] ?? null);
}

export function runChecks(run: RunResult): CheckResult[] {
  const { fixture: fx, body, interactions } = run;
  const out: CheckResult[] = [];
  const add = (name: string, pass: boolean, detail = "") => out.push({ name, pass, detail });

  const issues = validateBody(body, {
    photoIds: fx.photoIds, photoCount: fx.photoIds.length,
    interactionIds: interactions.map((i) => i.id), interactionCount: interactions.length,
  });
  const dangling = issues.filter((i) => i.type === "unknown-photo" || i.type === "unknown-ask");
  add("no-dangling-refs", dangling.length === 0, dangling.map((d) => JSON.stringify(d)).join(", "));

  // validateBody also flags malformed :::poll/:::quiz blocks it finds in the body.
  const badBlocks = issues.filter((i) => i.type === "bad-interaction");
  add("interactions-valid", badBlocks.length === 0,
    badBlocks.length ? `${badBlocks.length} malformed :::poll/:::quiz block(s)` : "");

  add("no-raw-blocks", !body.includes(":::poll") && !body.includes(":::quiz"),
    "raw :::poll/:::quiz left in saved body");

  const want = requestedQuizCount(fx.ask);
  const gotQuiz = interactions.filter((i) => i.kind === "quiz").length;
  add("quiz-count", want === null || gotQuiz === want,
    want === null ? "no explicit request" : `asked ${want}, got ${gotQuiz}`);

  const greet = /(liebe gr(ü|ue)(ß|ss)e|herzlich|viele gr(ü|ue)(ß|ss)e)/i.test(body);
  add("no-signoff", !greet, "greeting/sign-off present");

  // The title is the saved post title (outline.title), not something parsed
  // from the body — the body opens with section ## headings, no H1.
  const title = (run.title ?? "").trim();
  add("title-shape",
    title.length > 0 && title.split(/\s+/).length <= 8 && !title.includes(":"),
    `title="${title}"`);

  add("has-headings", /^##\s/m.test(body), "no ## section headings");

  const quizBad = interactions.some(
    (i) => i.kind === "quiz" && (i.options.length < 2 || i.options.length > 4 || i.correct_index === null),
  );
  add("quiz-wellformed", !quizBad, "a quiz has wrong option count or no correct answer");

  const capMissing = run.captions.filter((c) => !c.caption).map((c) => c.id);
  add("captions-present", capMissing.length === 0, `missing captions: ${capMissing.join(", ")}`);

  // Crude language guard: a German draft shouldn't contain long runs of English stopwords.
  if (fx.lang === "de") {
    const eng = (body.match(/\b(the|and|with|from|this|that|were|where)\b/gi) ?? []).length;
    add("language", eng <= 3, `${eng} English stopwords in a de draft`);
  }
  return out;
}
