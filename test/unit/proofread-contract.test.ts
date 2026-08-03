import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateFindings, type ProofUnit } from "@/lib/ai/proofread";

// The prompt and the validator are two halves of one contract, written in two
// files, and nothing connects them but agreement.
//
// They drifted. The route was changed to send a `units` array with `key`s, but
// the edit to the system prompt silently failed to apply — so the model was
// still told "you are given fields title, excerpt and body … return `field`".
// It answered with `field`; validateFindings read `key`, found undefined, and
// dropped every caption finding. No error, no empty response, no failed call:
// the proofreader simply never mentioned captions, and the usage log looked
// perfectly healthy (ok=true, findings returned).
//
// Worse, it survived review: the probe used to "reproduce production" had the
// intended prompt typed into it rather than the deployed one, so it passed while
// production failed. These tests read the actual route file for that reason.

const ROUTE = readFileSync("src/app/api/admin/ai/proofread/route.ts", "utf8");

describe("the prompt asks for what the validator reads", () => {
  it("tells the model to answer with `key`", () => {
    expect(ROUTE).toMatch(/"key":"<the unit key, copied exactly>"/);
  });

  it("no longer describes the old field-based contract", () => {
    // The exact string that shipped and broke it.
    expect(ROUTE).not.toMatch(/"field":"title"\|"excerpt"\|"body"/);
    expect(ROUTE).not.toMatch(/a JSON object with fields "title"/);
  });

  it("describes the units array it actually sends", () => {
    expect(ROUTE).toMatch(/`units` array/);
    expect(ROUTE).toMatch(/caption:<id>/);
  });

  it("sends units, not a bare field map", () => {
    expect(ROUTE).toMatch(/JSON\.stringify\(\{\s*units\s*\}\)/);
  });
});

describe("a finding shaped the old way is rejected, loudly in a test", () => {
  const units: ProofUnit[] = [
    { key: "body", text: "Es war schoen." },
    { key: "caption:p1", text: "Lochgefängniss am Streitberg", ordinal: 7 },
  ];

  it("drops a finding that names `field` instead of `key`", () => {
    // This is exactly what production received for weeks of a night: valid
    // findings, unusable shape.
    const out = validateFindings(
      {
        findings: [
          { field: "body", type: "spelling", original: "schoen", suggestion: "schön", explanation: "" },
        ],
      },
      units,
    );
    expect(out).toEqual([]);
  });

  it("keeps the same finding once it names `key`", () => {
    const out = validateFindings(
      {
        findings: [
          { key: "body", type: "spelling", original: "schoen", suggestion: "schön", explanation: "" },
        ],
      },
      units,
    );
    expect(out).toHaveLength(1);
  });
});
