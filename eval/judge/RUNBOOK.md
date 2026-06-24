# Judge orchestration runbook (for the controller)

How to run the quality/truthfulness evaluation reliably and repeatably. This is
the **how** (the controller's procedure); `eval/JUDGING.md` is the **what** (the
rubric the judges apply). Read both before starting.

The pipeline: produce drafts + packets → spawn one judge subagent per fixture →
each writes a verdict JSON → assemble into `quality-report.md` → read, sanity-
check, summarize. Then iterate by changing **generation** prompts and re-running.

---

## 0. Preconditions

- The eval cache is warm and deterministic (stable post/photo ids → cache hits).
  A clean `npm run eval` should finish in ~2s and re-running gives identical
  drafts. If it takes minutes or titles change between runs, the cache is being
  busted — stop and fix that first (see `eval/run.eval.ts` `stableUuid`).
- Vision is working: packet photos show real descriptions, not "(no
  description)". If they're empty, vision isn't running (check the `data:` URL
  path in `enrich.ts` and that a vision provider is configured) — the judges are
  near-worthless without the image ground truth.

## 1. Produce a fresh run with packets

```bash
npm run eval                 # cached: ~2s, regenerates packets from cache
# after changing a GENERATION prompt, regenerate the drafts too:
EVAL_REFRESH=llm npm run eval # ~10-15 min, real LLM calls
# after changing how photos are read:
EVAL_REFRESH=vision,llm npm run eval
```

Capture the run dir it prints (e.g. `eval/runs/2026-06-24T18-41-03-872Z`). It
contains `results.json` (structural), `report.md`, and `packets/<slug>.md` —
one self-contained packet per fixture. **Always re-run the eval after any prompt
change**; the packets must reflect the drafts you're judging.

The four fixtures: `lisbon-earthtrekkers`, `norway-preikestolen`,
`kyoto-temples`, `schwarzwald-triberg`.

## 2. Spawn the judge subagents — one per fixture, in parallel

- **Model: Sonnet.** Truthfulness is claim-by-claim grounding reasoning; Haiku
  over- and under-flags. (Haiku is only acceptable for a cheap structural-only
  re-check, never for the truthfulness pass.)
- **One subagent per fixture**, all dispatched in a single message so they run
  concurrently. Never bundle multiple fixtures into one judge — focused context
  is what keeps them accurate.
- Each subagent gets only file paths + instructions, never pasted file contents
  (keeps the controller's context clean).

Dispatch prompt template (fill `<RUNDIR>`, `<SLUG>`, and absolute repo path):

```
You are a strict editorial fact-checker grading ONE AI-generated travel-blog draft.

Read, in order:
1. The rubric — <REPO>/eval/JUDGING.md. Follow it exactly.
2. The packet — <REPO>/<RUNDIR>/packets/<SLUG>.md. This is your ONLY source of
   truth. It has the GROUND TRUTH (the author's notes, answers, the vision
   model's per-photo descriptions, place names, track) and the GENERATED draft,
   captions, and interactions under evaluation, plus a reference for coverage only.

Cardinal rule: a factual claim about a visited place is a FABRICATION unless it
traces to the packet's ground truth (a photo description, a note, an answer, or a
place name). A claim being true in the real world is NOT grounding — judge only
against the packet. Do NOT use your own knowledge of these places. Atmosphere,
mood, and feeling are allowed invention; facts about the sites are not.

Write your verdict as JSON to <REPO>/<RUNDIR>/judge-<SLUG>.json using the Write
tool, matching the schema in JUDGING.md exactly (truthfulness{verdict,
fabrications[], allowed_embellishments[]}, faithfulness, photo_alignment,
interactions, prose, overall, summary). Ensure it is valid, parseable JSON.

Return only one line: "<SLUG>: <overall> — N critical fabrications". Nothing else.
```

Use `general-purpose` (or default) agent type — it has Read + Write.

## 3. Verify, then assemble

Before assembling, confirm every judge wrote a **valid** JSON file:

```bash
for f in <RUNDIR>/judge-*.json; do node -e "JSON.parse(require('fs').readFileSync('$f'))" \
  && echo "ok $f" || echo "BAD $f"; done
```

Re-dispatch any fixture whose file is missing or unparseable (same prompt). Then:

```bash
node eval/judge/assemble.mjs <RUNDIR>     # writes <RUNDIR>/quality-report.md
```

## 4. Read and sanity-check

- Read `quality-report.md`. Lead with the **roll-up**: critical-fabrication
  counts per fixture and the systemic pattern.
- **Spot-check 2-3 flagged fabrications** against the packet's ground truth
  before trusting the report — judges produce false positives. If a "fabrication"
  is actually described in a photo or stated in the notes, the judge erred; note
  it and, if widespread, tighten the dispatch prompt and re-judge that fixture.
- Summarize for the user: the headline number, the worst offenders, the systemic
  driver, and the concrete generation change it implies.

## 5. The iteration loop

The report exists to drive generation fixes:
1. Identify the systemic failure (e.g. the generator stating site-facts it was
   never given).
2. Change the **generation** prompts (`outline`/`section` routes) — e.g. add:
   *state facts only if they appear in the provided material; invent mood and
   atmosphere, never facts about the places.*
3. `EVAL_REFRESH=llm npm run eval` to regenerate, then re-run steps 2-4.
4. Diff the roll-up. Critical fabrications should drop without the prose
   collapsing. Bump the rubric version in JUDGING.md if criteria changed.

---

## Reliability rules (the things that go wrong)

- **The packet is the only truth.** The single most common judge error is using
  world knowledge ("there really are peacocks at São Jorge") as grounding. The
  prompt forbids it; reinforce if a judge slips.
- **Re-run the eval after every prompt change.** Stale packets judge the wrong
  draft. The packet's draft must be the one you're reasoning about.
- **Sonnet for truthfulness, always.** Don't downgrade to save tokens; the cost
  is four short drafts.
- **Parallel, one per fixture.** Dispatch together; don't serialize, don't bundle.
- **Validate JSON before assembling.** The assembler skips unparseable files
  silently — a missing fixture in the report usually means a bad judge write.
- **Judges vary run-to-run** (LLM nondeterminism, no cache on the Agent path).
  For a high-stakes verdict, optionally dispatch a second judge per fixture to
  re-check only the flagged fabrications (adversarial verify) and keep a
  fabrication only if both agree. Otherwise accept minor variance and treat
  counts as approximate.
- **Never give a judge the source blog** — only the packet (its `reference` is a
  paraphrase, explicitly marked not-a-truth-source).
- **Paths must be absolute** in dispatch prompts; subagents don't share the
  controller's cwd assumptions.

## Quick checklist

- [ ] `npm run eval` ran; note `<RUNDIR>`; packets have real descriptions
- [ ] N judge subagents (Sonnet) dispatched in parallel, one per fixture
- [ ] N `judge-<slug>.json` files exist and are valid JSON
- [ ] `node eval/judge/assemble.mjs <RUNDIR>` → `quality-report.md`
- [ ] Spot-checked ≥2 flagged fabrications against the packet
- [ ] Summarized roll-up + the generation change it implies
