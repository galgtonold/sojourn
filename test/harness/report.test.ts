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
  fixture: fx, questions: ["Q?"], body: "## H\n\n[ask:i1]",
  interactions: [{ id: "i1", kind: "quiz", options: ["a", "b"], correct_index: 0 }],
  captions: [{ id: "p1", caption: "cap" }],
};

describe("writeReport", () => {
  it("writes report.md and results.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "evalrun-"));
    const { reportPath, jsonPath } = writeReport(
      [{ run, checks: [{ name: "quiz-count", pass: true, detail: "" }] }], dir);
    expect(readFileSync(reportPath, "utf8")).toContain("## t1");
    const json = JSON.parse(readFileSync(jsonPath, "utf8"));
    expect(json.t1["quiz-count"]).toBe(true);
  });
});
