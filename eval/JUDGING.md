# Judging AI travel-journal drafts

The automated checks in `eval/harness/checks.ts` test **form** — that a draft is
well-structured (no dangling refs, the right quiz count, a short title, real
headings, the right language, every photo captioned). They say nothing about
whether the draft is **true, faithful, and good**. This document defines the
quality judgement that sits on top of them: which aspects to judge, how to judge
each, and how the judging pipeline assembles into a report we iterate against.

It is written to double as the **instruction sheet handed to a judge subagent**.

---

## The cardinal rule: truthfulness

> A draft may invent **atmosphere**. It must never invent **facts about the
> places the author actually visited.**

This is the single most important axis, and it gates everything else. A draft
with even one fabricated site-fact has failed, no matter how good the prose is.

The pipeline reads beautifully *because* the model pads thin input with its own
encyclopedic knowledge of famous places — and that is exactly the danger. The
facts are often correct about the world, but they are **ungrounded for this
author's trip**: they put observations and knowledge into the author's mouth
that the author never recorded. On a lesser-known trip, or where the model's
knowledge is stale, the same behaviour invents outright falsehoods in the
author's voice.

### Two categories every concrete statement falls into

**1. Atmosphere & interiority — invention is allowed.**
The writer's craft: the author's feelings, mood, pacing, framing, hypotheticals,
and *generic* sensory texture that isn't a checkable claim about that specific
site. These are fine even when nothing in the input prompted them.
- "the silence settled on us like a gift"
- "our legs reminded us who was boss"
- "the morning still felt like night"
- "a stray cat warming itself on the wall" (generic, plausible, not a notable
  feature being asserted)

**2. Asserted facts about the visited site or world — must be grounded.**
Anything a reader would take as *information about the place*: who built it, what
it is made of, its history, its name/identity, what wildlife or objects or
adjacent landmarks are there, measurements, dates, what is visible from it.
These must trace to a source in the input (below). If they cannot, they are
**fabrications** — and a fabrication is a defect *even when the real-world fact
is correct*.

Real examples flagged from our own drafts (all currently **unflagged** by the
structural checks):
- Lisbon — "Peacocks strutted among the ruins" (wildlife claim); "the bronze
  horseman of King José I" (statue identity); "the twin towers of São Vicente de
  Fora and the dome of the National Pantheon" (named landmarks asserted visible);
  "the smell of grilled sardines" (specific sensory-factual).
- Kyoto — "no nails used in the construction" (Kiyomizu construction fact); the
  Golden Pavilion's "ground floor keeps a simpler, darker elegance" (architectural
  fact); "Kennin-ji, Kyoto's oldest Zen temple ... twin dragons" (a whole site +
  its features the author never mentioned visiting).
- Norway — the steps "Nepali sherpas had laid" (historical attribution).

### The grounding set (the judge's source of truth)

A factual claim is **grounded** only if it traces to one of:
- a **photo's vision description** (what is actually visible in the image),
- the author's **notes** (`ai_notes`),
- the author's **answers** to the generated questions,
- the **place name / coordinates / reverse-geocoded location**,
- the **GPX track** (route, start/end, distance),
- the **weather** data for the day,
- the **trip title / date**.

Grounding is **per-claim, not per-subject.** Naming Kinkaku-ji is grounded (it's
a geotagged photo); asserting its ground floor is ungilded is *not*, unless a
photo description says so. Describing "ornate carved stonework" at Jerónimos is
grounded if it's visible in the photo; "no nails used" never is — it's
encyclopedic.

### Decision procedure (per sentence)

1. Is this a **checkable factual claim** about a place/object/event, or is it
   **atmosphere / interiority**?
2. Atmosphere → allowed. (Only flag if it *contradicts* the input or is wildly
   implausible.)
3. Factual → look for a grounding source. Grounded → OK. Ungrounded →
   **fabrication**: record the claim, why it's ungrounded, and a severity.

### Severity

- **Critical** — a specific factual claim a reader would trust as the author's
  first-hand knowledge: construction, history, attribution, identity, wildlife,
  named adjacent landmarks, measurements, dates. *Any single critical fabrication
  fails the draft on truthfulness.*
- **Minor** — a specific-but-trivial sensory claim that leans factual ("the smell
  of grilled sardines", "a fado guitarist drifted up"). Record it; it does not by
  itself fail the draft. These are the calibration grey zone (see below).

---

## The other dimensions

Judged after truthfulness; a draft can be truthful but still weak here.

### Faithfulness to the provided input
- Does the draft actually **use** the author's answers and notes, or ignore them?
  (e.g. the supplied "two sisters", "family of four", "chestnuts on a bench".)
- Does it **contradict** any provided fact — wrong companions, wrong date, wrong
  location, weather opposite to the data?
- Are **all photos** woven in, in a sensible (roughly chronological) order?

### Photo ↔ text alignment
- Does each **caption** match what the photo's vision description says is in the
  image (not a generic line that could fit any photo)?
- Is each photo placed in a **section whose scene matches** the image?

### Interaction quality (polls / quizzes)
- Quiz: is the question answerable from the post? Is the marked answer **actually
  correct**? Are the options **distinct** (no duplicates) with plausible
  distractors? — *Note: our Kyoto draft shipped a quiz with the option "Fushimi
  Inari Taisha" listed twice, and `quiz-wellformed` passed it. This dimension is
  meant to catch exactly that.*
- Poll: is it a genuine opinion question (no single correct answer)?
- Is the interaction grounded in the post's content, not bolted on?

### Prose quality & voice
- Reads as a **personal journal in the author's style**, not a guidebook,
  listicle, or brochure.
- Coherent arc; no repeated backstory or doubled intros/outros.
- Correct language throughout (de/en) and no letter/sign-off elements.

---

## Output: one structured verdict per fixture

Each judge writes a single JSON file so results are machine-assemblable. Schema:

```json
{
  "slug": "lisbon-earthtrekkers",
  "truthfulness": {
    "verdict": "fail",
    "fabrications": [
      { "claim": "Peacocks strutted among the ruins", "kind": "wildlife",
        "severity": "critical", "why": "Not in any photo description, note, or answer." },
      { "claim": "the bronze horseman of King José I", "kind": "identity",
        "severity": "critical", "why": "Statue identity not provided; from model knowledge." }
    ],
    "allowed_embellishments": ["a stray cat warming on the chapel wall"]
  },
  "faithfulness":   { "verdict": "pass", "uses_answers": true, "contradictions": [] },
  "photo_alignment":{ "verdict": "pass", "mismatches": [] },
  "interactions":   { "verdict": "fail", "issues": ["quiz 1 repeats the option 'Fushimi Inari Taisha'"] },
  "prose":          { "verdict": "pass", "notes": "Strong arc, varied rhythm; occasionally guidebook-ish." },
  "overall": "fail-truthfulness",
  "summary": "Well-written and on-location, but invents five site-facts the author never recorded."
}
```

`verdict` ∈ `pass | warn | fail`. `overall` names the first failing dimension
(truthfulness first), or `pass`.

---

## Pipeline

```
                 ┌──────────────── per fixture ────────────────┐
 cached draft ──▶│  build judge packet  ──▶  judge subagent(s) │──▶ judge-<slug>.json
 + ground truth  └─────────────────────────────────────────────┘
        (×N fixtures, in parallel)                                       │
                                                                         ▼
 structural results.json ───────────────────────────────────▶  assembler  ──▶  quality-report.md
```

1. **Judge packet** (per fixture): assemble the *ground-truth set* (photo vision
   descriptions, notes, answers, place names, a one-line track summary, weather,
   trip meta) plus the *generated artifacts* (title, body, captions, interactions)
   plus `reference.md`. The ground-truth set is the dossier the generator saw —
   reuse it so the judge checks against exactly what the model was given.
2. **Judge subagents**, one per fixture, run in parallel and each write
   `eval/runs/<ts>/judge-<slug>.json` against the schema above. Truthfulness is
   the heavy, claim-by-claim pass; it can be its own focused subagent if a single
   judge proves shallow on it. Judges run over the **cached, deterministic**
   drafts, so a packet → verdict is reproducible; cache the judge calls too,
   keyed on (draft + rubric version), so re-assembly is free until something
   changes.
3. **Assembler** reads every `judge-<slug>.json` plus the structural
   `results.json` and emits `eval/runs/<ts>/quality-report.md`: a per-fixture
   section (structural ✅/❌ + each quality dimension + the fabrication list) and a
   top **roll-up** — counts of critical fabrications per fixture, the systemic
   patterns, and the worst offenders.

### The iteration loop

The report exists to drive generation fixes, not just to grade:
1. Read the roll-up; find the **systemic** failure (today: embellishment — the
   generator states site-facts it was never given).
2. Change the **generation** side to address it (e.g. add an anti-fabrication
   instruction to the outline/section prompts: *state facts only if they appear
   in the provided material; you may invent mood and atmosphere, never facts
   about the places*).
3. **Refresh** the affected fixtures (`EVAL_REFRESH=llm`), re-judge, and diff the
   roll-up. Fabrication counts should drop without the prose collapsing.
4. Repeat. The rubric version bumps when criteria change, which invalidates the
   judge cache so verdicts are recomputed.

---

## Calibration (open, for human tuning)

These are deliberate judgement calls to settle as we see real verdicts:
- **The atmosphere/fact line.** "Grilled sardines on the air" — allowed colour or
  a fabricated site-detail? Current stance: *minor*, not gating. Tighten or relax
  after a first run.
- **Visible-vs-encyclopedic for famous places.** We hold the line at "only what a
  photo shows or the input states," even for landmarks the model obviously knows.
  This is strict on purpose; it's the whole point.
- **How strict on prose** before a `warn` — guidebook drift is a smell, not yet a
  fail.
- **Reference weight.** `reference.md` is a sanity anchor for *coverage/arc*, not
  a target to match word-for-word; the ground-truth set, not the reference, is
  what truthfulness is judged against.
