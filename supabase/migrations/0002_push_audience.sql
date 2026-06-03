-- Distinguish push subscription audiences:
--   'admin'  → the site owner; gets comment alerts
--   'viewer' → readers who opted in to new-article notifications
alter table public.push_subscriptions
  add column if not exists audience text not null default 'viewer';
create index if not exists push_subscriptions_audience_idx
  on public.push_subscriptions(audience);
