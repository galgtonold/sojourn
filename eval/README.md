# AI eval harness

`npm run eval` runs the real AI pipeline over fixtures in `eval/fixtures/`, applies
deterministic checks, and writes `eval/runs/<timestamp>/report.md` (+ `results.json`).
Hand `report.md` to Claude for the subjective quality judgement.

- `EVAL_FIXTURE=<slug> npm run eval` — one fixture.
- `EVAL_REFRESH=weather npm run eval` (or `all`, or a comma list) — re-invoke cached calls of that kind.
- `EVAL_FAKE=1 npm run eval` — free smoke run, no API calls.
- **Real run (no `EVAL_FAKE`):** requires provider env vars set locally — e.g. `DEEPSEEK_API_KEY`, plus any vision/embedding keys — otherwise calls 401/fail on a cache miss.

## Fixtures (gitignored; private)
Real trips under `eval/fixtures/<slug>/`: `fixture.json` (manifest), `photos/`, optional
`track.gpx`, optional `reference.md`. **Sourced from freely-accessible pages, manually,
small, never committed, never republished** — for local eval only. See the design spec.
