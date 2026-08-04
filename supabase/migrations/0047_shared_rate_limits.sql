-- A rate limiter that survives a cold start, and is shared between instances.
--
-- The old one was a Map in module scope. On serverless that is PER-INSTANCE and
-- reset whenever a lambda goes cold — so on Vercel it deterred a script hammering
-- one warm instance and nothing else: spread the same flood across regions, or
-- simply wait out a cold start, and the limit was never reached. It also meant
-- the two endpoints that most wanted throttling (push subscription, invite
-- acceptance) were left unthrottled entirely rather than given a guard that
-- would not hold.
--
-- Postgres is already here, already shared, and already the thing an abusive
-- request is trying to reach. One row per key per window, incremented
-- atomically.
--
-- FIXED windows, not sliding. A sliding window needs the timestamps of every
-- hit; a fixed one needs a counter, which `on conflict do update` increments in
-- a single statement with no read-modify-write to race. The cost is that a
-- burst straddling a boundary can reach twice the limit for a moment. For
-- deterring floods that is a fair trade, and it is written down here rather
-- than discovered later.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Nothing reads this table directly; it exists for the function below.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

comment on table public.rate_limits is
  'Fixed-window counters for @/lib/rate-limit. Rows expire by being ignored; see prune_rate_limits.';

/**
 * Count one hit and say whether it is still within the limit.
 *
 * Returns true when the caller may proceed. Security definer because the table
 * is deliberately unreadable to everyone — the counter is not information a
 * visitor should be able to enumerate.
 */
create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  bucket timestamptz;
  hits integer;
begin
  if p_key is null or p_limit is null or p_limit <= 0
     or p_window_seconds is null or p_window_seconds <= 0 then
    -- Fail OPEN on nonsense arguments. A limiter that starts refusing traffic
    -- because it was called wrongly is a worse outage than the flood it guards.
    return true;
  end if;

  bucket := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits (key, window_start, count)
       values (p_key, bucket, 1)
  on conflict (key, window_start)
    do update set count = public.rate_limits.count + 1
    returning count into hits;

  return hits <= p_limit;
end;
$$;

-- Only the service role calls this. Letting anon call it would hand out a way to
-- burn someone else's budget by naming their key — every key is derived from a
-- client IP, so it is a targeted lockout, not just self-harm.
--
-- Revoked from anon and authenticated BY NAME, not only from PUBLIC: Supabase
-- ships ALTER DEFAULT PRIVILEGES granting EXECUTE on every new function in this
-- schema to both roles, and revoking from PUBLIC leaves that explicit grant
-- untouched. Checked on the live database rather than assumed — it came back
-- callable by anon the first time.
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

/**
 * Drop counters nobody will consult again.
 *
 * Called opportunistically from the app rather than scheduled, because a
 * self-hosted instance has no pg_cron and this table is small enough that
 * occasional housekeeping is plenty.
 */
create or replace function public.prune_rate_limits(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  delete from public.rate_limits
   where window_start < now() - make_interval(hours => greatest(p_older_than_hours, 1));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.prune_rate_limits(integer) from public, anon, authenticated;
grant execute on function public.prune_rate_limits(integer) to service_role;
