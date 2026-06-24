# Judging AI travel-journal drafts

The automated checks in `eval/harness/checks.ts` test **form** — that a draft is
well-structured (no dangling refs, the right quiz count, a short title, real
headings, the right language, every photo captioned). They say nothing about
whether the draft is **true, faithful, and good**. This document defines the
quality judgement that sits on top of them: which aspects to judge, how to judge
each, and how the judging pipeline assembles into a report we iterate against.

It is written to double as the **instruction sheet handed to a judge subagent**.

---

## The cardinal rule: never make anything up

> A draft may invent **atmosphere and feeling**, and may add **accurate, well-
> known context about a famous place**. It must never **make things up** — neither
> invent the author's own experiences nor state facts that are false or uncertain.

This is the gating axis. A draft with even one made-up thing fails truthfulness,
no matter how good the prose is. "Made up" takes two forms, both fail:

1. **Invented experience.** Presenting as the author's own first-hand experience
   something not grounded in the photos, notes, or answers: a specific thing seen,
   an action taken, a person met, words someone said, a thing tasted or heard. The
   *events and observations of the trip* must come from the material — the model
   may narrate them, never author them. (e.g. "we cupped our hands and drank from
   the waterfall"; a quote attributed to the watchmaker; "ravens flew overhead";
   "a fado musician began to play"; "a German couple offered to take our photo".)
2. **False or shaky facts.** Stating as fact something untrue, or something the
   model cannot be genuinely confident is correct. (e.g. an invented statistic, a
   wrong attribution, a guessed species or rock type asserted as certain.)

### What IS allowed

- **Atmosphere & interiority.** The author's feelings, mood, pacing, framing, and
  *generic* sensory texture that isn't a checkable claim about that specific site —
  "the silence settled like a gift", "our legs reminded us who was boss", "a stray
  cat warming on the wall".
- **Accurate, well-known context about a famous place.** A confident, verifiable
  historical / cultural / architectural fact about a landmark, woven in lightly as
  a knowledgeable narrator would — "Kiyomizu's stage is famously built without
  nails", "the temple's name means 'pure water'", "Fushimi Inari's torii are
  donated by businesses". It must be **true and uncontroversial**; if the model
  can't be sure, it's a shaky fact (above). Keep it light: a guidebook lecture is
  a prose smell even when it's true.

The line between allowed context and invented experience is **framing**:
"Kiyomizu's stage is famously built without nails" (general, true, narrator
context) is fine; "we ran our hands along the joints, marvelling that not one nail
held it together" (a specific first-hand action that didn't happen) is not.

### The judge uses its own knowledge here

Unlike a pure grounding check, this rubric **requires** world knowledge: to
confirm an "allowed" historical fact is actually true and well established, and to
catch a false or dubious one. A confident, correct, famous-place fact passes; a
wrong or uncertain one is a fabrication.

### The grounding set (what the author actually provided)

The author's *experience* — what was seen, done, and said on the trip — must trace
to one of:
- a **photo's vision description** (what is actually visible in the image),
- the author's **notes** (`ai_notes`),
- the author's **answers** to the generated questions,
- the **place name / coordinates / reverse-geocoded location**,
- the **GPX track** (route, start/end, distance),
- the **weather** data for the day,
- the **trip title / date**.

If the draft says the author saw / did / heard / met / tasted something specific
that is not here, it is an **invented experience** — even if such a thing is
plausible at that place.

### Decision procedure (per claim)

1. Atmosphere / feeling / generic texture? → allowed (flag only if it contradicts
   the material).
2. A general, well-known fact about the famous place, stated as narrator context?
   → allowed **if** it is true and the model is confident; flag as a **false/shaky
   fact** if it is wrong or uncertain.
3. Presented as the author's specific first-hand experience or observation
   (saw / did / heard / met / tasted / was told) and not in the grounding set?
   → **invented experience** (fabrication), regardless of plausibility.

### Severity

- **Critical** — an invented experience, or a false/shaky factual claim. *Any
  single critical fabrication fails the draft.*
- **Minor** — a borderline sensory-factual detail that leans invented but is
  trivial and plausible ("the air smelled faintly of green tea"). Record it; it
  does not by itself fail the draft.

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
- **Famous-place facts are allowed when accurate and confident** (revised after
  the first run). A true, well-known historical/cultural fact about a landmark is
  context, not a fabrication. The judge must verify it's actually true; a wrong or
  uncertain "fact" is a fabrication. The hard cases are the model's *confidence*
  threshold and how heavy the context can get before it's a prose (not
  truthfulness) problem.
- **Invented experience is the real target.** The decisive question is whether the
  draft claims the *author* personally saw/did/heard/met/tasted a specific thing
  that isn't in the material. That always fails, however plausible.
- **The atmosphere/experience line.** "Grilled sardines on the air" — allowed
  generic colour, or an invented specific observation? Current stance: *minor*
  unless framed as a definite first-hand observation. Tune as verdicts come in.
- **How strict on prose** before a `warn` — guidebook drift is a smell, not yet a
  fail.
- **Reference weight.** `reference.md` is a sanity anchor for *coverage/arc*, not
  a target to match word-for-word; the grounding set (plus the judge's
  verification of any stated facts) is what truthfulness is judged against.
