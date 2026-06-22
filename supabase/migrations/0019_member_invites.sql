-- Custom invite tokens for collaborators, valid for 7 days.
--
-- Supabase's recovery/OTP links expire by the project-wide email-OTP setting
-- (≈1h, capped at 24h), so they can't carry a week-long invite. Instead we issue
-- our own token here (sha256 stored, raw token in the link) with a 7-day expiry;
-- when the invitee clicks, the accept endpoint mints a fresh short-lived Supabase
-- recovery token at that moment to establish the session.
create table if not exists public.member_invites (
  token text primary key,                       -- sha256 of the raw invite token
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists member_invites_user_id_idx
  on public.member_invites (user_id);

-- Only the service role touches this table (owner invite route + accept route);
-- RLS on with no policies blocks all anon/authenticated access.
alter table public.member_invites enable row level security;
