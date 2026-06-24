// eval/judge/assemble.mjs
// Merge the per-fixture judge verdicts (judge-<slug>.json, written by the judge
// subagents) with the structural results (results.json) into one quality
// report. Run after the judges have written their files:
//
//   node eval/judge/assemble.mjs [runDir]
//
// runDir defaults to the most recent eval/runs/<ts>. See eval/JUDGING.md.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const runsRoot = join(process.cwd(), "eval/runs");
const runDir = process.argv[2]
  ? process.argv[2]
  : join(runsRoot, readdirSync(runsRoot).filter((d) => /^\d{4}-/.test(d)).sort().at(-1) ?? "");

function readJson(path, fallback) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return fallback; }
}

const structural = readJson(join(runDir, "results.json"), {});
const judgeFiles = existsSync(runDir)
  ? readdirSync(runDir).filter((f) => f.startsWith("judge-") && f.endsWith(".json"))
  : [];
const verdicts = judgeFiles.map((f) => readJson(join(runDir, f), null)).filter(Boolean);
const bySlug = Object.fromEntries(verdicts.map((v) => [v.slug, v]));

const ICON = { pass: "✅", warn: "⚠️", fail: "❌" };
const icon = (v) => ICON[v] ?? "·";
// Judges sometimes return list items as objects ({claim, why, ...}) instead of
// strings; render either without "[object Object]".
const asText = (x) =>
  typeof x === "string"
    ? x
    : [x?.claim, x?.issue, x?.note, x?.detail, x?.why].filter(Boolean).join(" — ") || JSON.stringify(x);
const structScore = (slug) => {
  const c = structural[slug];
  if (!c) return "n/a";
  const vals = Object.values(c);
  return `${vals.filter(Boolean).length}/${vals.length}`;
};
const critCount = (v) =>
  (v?.truthfulness?.fabrications ?? []).filter((f) => f.severity === "critical").length;

const out = [];
out.push("# AI draft quality report", "");
out.push(`Run: \`${runDir.split(/[\\/]/).slice(-1)[0]}\` · ${verdicts.length} judged · see eval/JUDGING.md for the rubric.`, "");

// Roll-up
out.push("## Roll-up", "");
out.push("| Fixture | Structural | Truthfulness | Critical fabrications | Overall |");
out.push("|---|---|---|---|---|");
for (const slug of Object.keys({ ...structural, ...bySlug })) {
  const v = bySlug[slug];
  out.push(
    `| ${slug} | ${structScore(slug)} | ${v ? icon(v.truthfulness?.verdict) + " " + (v.truthfulness?.verdict ?? "") : "—"} | ${v ? critCount(v) : "—"} | ${v?.overall ?? "—"} |`,
  );
}
out.push("");
const totalCrit = verdicts.reduce((n, v) => n + critCount(v), 0);
out.push(`**${totalCrit} critical fabrication(s)** across ${verdicts.length} drafts.`, "");

// Per fixture
for (const slug of Object.keys({ ...structural, ...bySlug })) {
  const v = bySlug[slug];
  out.push("---", "", `## ${slug}`, "");
  const c = structural[slug];
  if (c) {
    const failed = Object.entries(c).filter(([, ok]) => !ok).map(([k]) => k);
    out.push(`**Structural:** ${structScore(slug)}${failed.length ? ` — failed: ${failed.join(", ")}` : " — all pass"}`, "");
  }
  if (!v) { out.push("_No judge verdict written._", ""); continue; }

  out.push(`**Overall:** ${v.overall ?? "?"} — ${v.summary ?? ""}`, "");

  const t = v.truthfulness ?? {};
  out.push(`### ${icon(t.verdict)} Truthfulness — ${t.verdict ?? "?"}`, "");
  if ((t.fabrications ?? []).length) {
    for (const f of t.fabrications)
      out.push(`- **[${f.severity ?? "?"}]** ${f.claim} — _${f.kind ?? ""}: ${f.why ?? ""}_`);
  } else out.push("- No fabricated site-facts found.");
  if ((t.allowed_embellishments ?? []).length)
    out.push("", `_Allowed atmosphere:_ ${t.allowed_embellishments.join("; ")}`);
  out.push("");

  const dim = (label, d, lines) => {
    out.push(`### ${icon(d?.verdict)} ${label} — ${d?.verdict ?? "?"}`, "");
    for (const l of lines(d ?? {})) out.push(l);
    out.push("");
  };
  dim("Faithfulness", v.faithfulness, (d) => [
    `- Uses the author's answers: ${d.uses_answers === false ? "no" : "yes"}`,
    ...((d.contradictions ?? []).map((x) => `- Contradiction: ${asText(x)}`)),
    ...(((d.contradictions ?? []).length === 0) ? ["- No contradictions with the provided facts."] : []),
  ]);
  dim("Photo↔text alignment", v.photo_alignment, (d) =>
    (d.mismatches ?? []).length ? d.mismatches.map((x) => `- ${asText(x)}`) : ["- Captions/scenes match the photos."]);
  dim("Interactions", v.interactions, (d) =>
    (d.issues ?? []).length ? d.issues.map((x) => `- ${asText(x)}`) : ["- Well-formed and grounded."]);
  dim("Prose & voice", v.prose, (d) => [`- ${d.notes ?? ""}`]);
}

const dest = join(runDir, "quality-report.md");
writeFileSync(dest, out.join("\n"));
console.log(`\n📊 quality report: ${dest}\n`);
