-- Per-call AI usage log for the cost meter. Token counts are exact; cost is
-- computed from configurable rates at write time. Writes go through the service
-- role; only the owner can read.
create table if not exists public.ai_usage (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  user_id           uuid references auth.users(id) on delete set null,
  post_id           uuid references public.posts(id) on delete set null,
  operation         text not null,
  model             text not null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  cache_hit_tokens  integer not null default 0,
  cache_miss_tokens integer not null default 0,
  cost_usd          numeric(12,6) not null default 0
);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at desc);

alter table public.ai_usage enable row level security;
create policy "owner read ai_usage" on public.ai_usage
  for select to authenticated using (public.is_owner());

create or replace function public.ai_usage_summary()
returns json language sql stable security definer set search_path = public as $$
  select case when public.is_owner() then (
    select json_build_object(
      'total_cost', coalesce(sum(cost_usd), 0),
      'month_cost', coalesce(sum(cost_usd) filter (
        where created_at >= date_trunc('month', now())), 0),
      'tokens', coalesce(sum(prompt_tokens) + sum(completion_tokens), 0),
      'cache_hit', coalesce(sum(cache_hit_tokens), 0),
      'cache_total', coalesce(sum(cache_hit_tokens) + sum(cache_miss_tokens), 0),
      'calls', count(*),
      'by_op', (
        select coalesce(json_object_agg(operation, j), '{}'::json) from (
          select operation,
                 json_build_object('calls', count(*), 'cost', coalesce(sum(cost_usd), 0)) j
          from public.ai_usage group by operation
        ) s)
    ) from public.ai_usage
  ) else null end;
$$;
revoke execute on function public.ai_usage_summary() from public;
grant execute on function public.ai_usage_summary() to authenticated;
