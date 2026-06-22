-- Identify which authenticated admin a push subscription belongs to, so comment
-- notifications can be scoped to a collaborator's accessible posts (the owner
-- still hears about all). Nullable: viewer subscriptions and legacy admin rows
-- (the owner's existing browser) stay NULL and are treated as "hears everything".
alter table public.push_subscriptions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
