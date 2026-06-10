-- Async LLM jobs: a slow model call is enqueued here, run by the `llm-call`
-- Edge Function (which has a longer wall-clock budget than a Vercel function),
-- and polled by the client. Enqueue, fill and poll all happen through
-- privileged server/Edge code, so the table is locked to RLS with no client
-- policies.
create table if not exists public.ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending'
                check (status in ('pending', 'done', 'error')),
  model       text,
  input       jsonb not null default '{}'::jsonb,
  output      text,
  error       text,
  post_id     uuid references public.posts(id) on delete set null,
  user_id     uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_jobs_created_idx on public.ai_jobs (created_at desc);

drop trigger if exists trg_ai_jobs_touch on public.ai_jobs;
create trigger trg_ai_jobs_touch before update on public.ai_jobs
  for each row execute function public.touch_updated_at();

alter table public.ai_jobs enable row level security;
