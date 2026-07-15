-- Runtime-configurable provider secrets (AI keys, base URLs, model IDs), set
-- from /admin/settings. Values here OVERRIDE the matching environment
-- variables; absent keys fall back to env, then to a built-in default. This
-- exists so a self-hosted deploy can be configured from the UI instead of a
-- redeploy, and so both the app and the Edge Functions read ONE key.
--
-- SECURITY: RLS is enabled and there are DELIBERATELY NO POLICIES. That makes
-- the table unreadable through PostgREST for `anon` and `authenticated` alike —
-- only the service role (which bypasses RLS) can touch it. This is the whole
-- security model, so do not add a policy here. site_settings, by contrast,
-- grants authenticated read, which is why the keys are NOT stored there: every
-- signed-in trip member could read them.
create table if not exists public.app_secrets (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

alter table public.app_secrets enable row level security;

-- Belt and braces: RLS already blocks these roles, but revoking the grants means
-- a policy added by mistake later still exposes nothing.
revoke all on public.app_secrets from anon, authenticated;

create trigger trg_app_secrets_touch
  before update on public.app_secrets
  for each row execute function public.touch_updated_at();
