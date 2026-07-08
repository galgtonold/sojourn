# ADR-0001: The AI draft pipeline is orchestrated client-side

## Status
Accepted — 2026-07-08

## Context
The multi-step AI draft generation (enrich → outline → per-section generate →
homogenize → captions → save) is sequenced in the browser, in
`ai-draft-panel.tsx` `generate()`, rather than server-side. An architecture
review flagged this as an untested orchestration module and proposed extracting
it into a testable server-side pipeline.

## Decision
Keep the orchestration client-side for now.

Production runs on Vercel's **free tier**, whose serverless functions have a
short max execution time — far below the minutes the full pipeline takes across
many model calls. The slow steps (section, homogenize) already offload to a
Supabase Edge Function (`llm-call`) via the `ai_jobs` queue precisely because a
single Vercel request cannot hold them; the client enqueues and polls. Moving
the whole orchestration server-side would require long-running server execution
the free tier does not provide.

## Consequences
- The `generate()` sequencing, retry, job-polling and mask-restore fallbacks
  stay browser-bound and untested. Mitigate with observability/logging rather
  than extraction.
- Progress and abort UX stay natural (the client owns them).
- **Revisit** if the project leaves the free tier or gains a queue/worker with
  long execution — then extracting a deep, testable pipeline module (review
  candidate #1) becomes worthwhile.
