-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  See what the model was actually doing, without calling it by hand.     ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--
-- 0044 added reasoning_tokens and a failure preview, which was enough to say
-- THAT a call spent its budget thinking. It was not enough to say what it was
-- thinking about, or how long the author waited. Both had to be recovered by
-- reproducing the call by hand against the live API — twice, in one evening,
-- and the first reproduction was wrong because it was built from what the code
-- was supposed to say rather than what it said.
--
-- Three columns close the remaining gap.

-- How long the round trip took. The author's complaint was "it hung for
-- excessively long", and nothing in this table could confirm or refute that:
-- created_at records when the row was written, not how long the call ran.
alter table public.ai_usage
  add column if not exists duration_ms integer;

-- The opening of the model's chain-of-thought. `reasoning_tokens ≈
-- completion_tokens` says the budget went on thinking; this says what the
-- thinking was. In the case that prompted it, the first 2000 characters showed
-- a sentence-by-sentence German grammar commentary that never terminated —
-- diagnosable at a glance, where the token count alone left three possibilities.
alter table public.ai_usage
  add column if not exists reasoning_preview text;

-- The opening of what was SENT. This is the one that would have caught the
-- caption bug in a minute: the prompt described fields the route no longer
-- sent, and no counter anywhere could show that — only the text could.
alter table public.ai_usage
  add column if not exists request_preview text;

-- ── On content, deliberately ────────────────────────────────────────────────
--
-- These hold fragments of the operator's own drafts. `ai_usage` is service-role
-- only (0009) and never reaches a reader, so they are no more exposed than the
-- posts themselves — but they are still content in a metering table, so:
--
--   • every preview is truncated in the writer, not here;
--   • on a SUCCESSFUL call nothing is stored unless AI_DEBUG is set;
--   • on a FAILED call they are always stored, because that is the moment the
--     information is needed and the moment nobody has it.
--
-- The default is therefore: counters always, content only when something went
-- wrong or the operator asked for it.
