// test/harness/report.test.ts
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReport } from "../../eval/harness/report";
import type { RunResult } from "../../eval/harness/checks";
import type { LoadedFixture } from "../../eval/harness/fixture";

const fx = { slug: "t1", lang: "de", ask: "mach ein quiz mit 1 frage", photoIds: ["p1"],
  reference: "Ref text" } as unknown as LoadedFixture;
const run: RunResult = {
  fixture: fx, title: "Test Titel", questions: ["Q?"], body: "## H\n\n[ask:i1]",
  interactions: [{ id: "i1", kind: "quiz", options: ["a", "b"], correct_index: 0 }],
  captions: [{ id: "p1", caption: "cap" }],
};

describe("writeReport", () => {
  it("writes report.md and results.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalrun-"));
    const { reportPath, jsonPath } = writeReport(
      [{ run, checks: [{ name: "quiz-count", pass: true, detail: "" }] }], dir);
    const md = readFileSync(reportPath, "utf8");
    expect(md).toContain("## t1");
    expect(md).toContain("✅");
    expect(md).toContain("quiz-count");
    expect(md).toContain("Q?");
    expect(md).toContain("cap");
    expect(md).toContain("Ref text");
    expect(md).toContain("a / b");
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(json.t1["quiz-count"]).toBe(true);
  });

  it("handles body with triple-backtick fenced block without corrupting later sections", () => {
    const fxWithFence = { slug: "t2", lang: "en", ask: null, photoIds: [],
      reference: "Human ref here", trackPresent: false } as unknown as LoadedFixture;
    const runWithFence: RunResult = {
      fixture: fxWithFence,
      title: "Fence Test",
      questions: [],
      body: "## H\n\n```\ncode\n```\n\ntail-text",
      interactions: [],
      captions: [],
    };
    const dir = mkdtempSync(join(tmpdir(), "evalrun-fence-"));
    const { reportPath } = writeReport(
      [{ run: runWithFence, checks: [] }], dir);
    const md = readFileSync(reportPath, "utf8");
    // The reference section must appear intact after the body fence
    expect(md).toContain("### Human reference");
    expect(md).toContain("Human ref here");
  });
});
