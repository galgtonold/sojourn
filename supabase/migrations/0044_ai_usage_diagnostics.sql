-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Make a truncated AI call diagnosable without guessing.                 ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--
-- On 2026-08-03 the proofreader failed eight times in a row with
-- `finish_reason = 'length'` and `completion_tokens` pinned at the cap. From
-- `ai_usage` alone it was impossible to say WHY: 16000 completion tokens on a
-- 2200-token article is absurd, and the row cannot distinguish
--
--   • the model reasoning without bound and never starting the answer, from
--   • the model emitting an enormous answer (hundreds of findings), from
--   • something else entirely — a loop, an echo of the input, a refusal.
--
-- All three look identical: high completion_tokens, finish_reason 'length',
-- ok false. The first diagnosis was therefore an inference, not an
-- observation, which is not good enough for deciding what to fix.
--
-- Two columns close that gap.

-- DeepSeek reports this in `usage.completion_tokens_details.reasoning_tokens`,
-- and it is billed as part of completion_tokens. When it is ~= completion_tokens
-- the budget went on thinking; when it is near zero the model really did write
-- that much answer, which is a completely different bug.
alter table public.ai_usage
  add column if not exists reasoning_tokens integer;

-- The first ~600 characters of whatever came back, recorded ONLY when the call
-- failed. A cap-truncated response is usually empty (reasoning is billed first
-- and arrives first), and "empty" is itself the diagnosis — but when it is not
-- empty, the shape of the text says immediately whether the model was answering,
-- looping, or refusing.
--
-- Bounded deliberately: this is a diagnostic breadcrumb, not a transcript. It
-- holds the operator's own drafted content, and `ai_usage` is already
-- service-role only (0009), so it is no more exposed than the post itself.
alter table public.ai_usage
  add column if not exists response_preview text;
