-- Make AI failures diagnosable from the same table as usage — Vercel's free-tier
-- runtime logs are ephemeral, so persist the outcome. ok=false rows carry the
-- error message; finish_reason='length' flags a truncated (too-long) response,
-- which is the recurring cause of "failed" steps.
alter table public.ai_usage
  add column if not exists ok boolean not null default true,
  add column if not exists error text,
  add column if not exists finish_reason text;
