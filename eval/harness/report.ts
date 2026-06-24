// eval/harness/report.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunResult, CheckResult } from "./checks";

export type FixtureOutcome = { run: RunResult; checks: CheckResult[] };

function fenced(content: string, info = ""): string {
  const longest = Math.max(0, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  const ticks = "`".repeat(Math.max(3, longest + 1));
  return `${ticks}${info}\n${content}\n${ticks}`;
}

function fixtureSection(o: FixtureOutcome): string {
  const { run, checks } = o;
  const fx = run.fixture;
  const checkLines = checks.map((c) => `- ${c.pass ? "✅" : "❌"} **${c.name}** ${c.detail}`).join("\n");
  const quiz = run.interactions
    .map((i) => `  - (${i.kind}) ${(i.options ?? []).join(" / ")}${i.correct_index != null ? ` [correct: ${i.correct_index}]` : ""}`)
    .join("\n");
  return [
    `## ${fx.slug}`,
    `lang: ${fx.lang} · ask: ${fx.ask ?? "—"} · photos: ${fx.photoIds.length} · track: ${fx.trackPresent ? "yes" : "no"}`,
    ``,
    `### Checks`, checkLines || "(none)",
    ``,
    `### Generated questions`, run.questions.map((q) => `- ${q}`).join("\n") || "(none)",
    ``,
    `### Generated draft`, `**Title:** ${run.title || "(none)"}`, ``, fenced(run.body, "markdown"),
    ``,
    `### Interactions`, quiz || "(none)",
    ``,
    `### Captions`, run.captions.map((c) => `- ${c.id}: ${c.caption ?? "(none)"}`).join("\n"),
    ``,
    `### Human reference`, fx.reference ? `\n${fenced(fx.reference, "markdown")}` : "(none)",
    ``,
    `---`, ``,
  ].join("\n");
}

export function writeReport(outcomes: FixtureOutcome[], dir: string): { reportPath: string; jsonPath: string } {
  const md = [`# AI eval report`, ``, ...outcomes.map(fixtureSection)].join("\n");
  const json: Record<string, Record<string, boolean>> = {};
  for (const o of outcomes) {
    json[o.run.fixture.slug] = Object.fromEntries(o.checks.map((c) => [c.name, c.pass]));
  }
  const reportPath = join(dir, "report.md");
  const jsonPath = join(dir, "results.json");
  writeFileSync(reportPath, md);
  writeFileSync(jsonPath, JSON.stringify(json, null, 2));
  return { reportPath, jsonPath };
}
