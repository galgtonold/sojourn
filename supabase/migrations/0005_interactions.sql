-- Inline interactive blocks (polls & quizzes) embedded in posts.
create table if not exists public.interactions (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid references public.posts(id) on delete cascade,
  kind          text not null check (kind in ('poll', 'quiz')),
  question      text not null,
  options       jsonb not null,           -- array of option strings
  correct_index integer,                  -- quiz only; hidden from the public
  explanation   text,                      -- quiz reveal text
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);
create index if not exists interactions_post_idx on public.interactions(post_id);

create table if not exists public.interaction_responses (
  id             uuid primary key default gen_random_uuid(),
  interaction_id uuid not null references public.interactions(id) on delete cascade,
  visitor_token  text not null,
  choice_index   integer not null,
  created_at     timestamptz not null default now(),
  unique (interaction_id, visitor_token)
);
create index if not exists interaction_responses_idx
  on public.interaction_responses(interaction_id);

-- Both tables are admin/service-role only. The public never reads them
-- directly (which would leak quiz answers / visitor tokens); all reader
-- interaction goes through server APIs that use the service role and return
-- only safe, aggregated data.
alter table public.interactions enable row level security;
alter table public.interaction_responses enable row level security;
create policy "admin all interactions" on public.interactions
  for all to authenticated using (true) with check (true);
create policy "admin all interaction_responses" on public.interaction_responses
  for all to authenticated using (true) with check (true);
