-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  Comment reply/like notifications: link a comment and a viewer push      ║
-- ║  subscription to the anonymous reader who owns them, via the existing     ║
-- ║  visitor_token (sojourn:vid). Both columns are nullable — pre-existing    ║
-- ║  rows stay null and simply never trigger a reader notification.          ║
-- ╚════════════════════════════════════════════════════════════════════════╝

-- Who wrote the comment (anonymous per-browser id; same token comment_likes use).
alter table public.comments
  add column if not exists visitor_token text;

-- Which reader owns a viewer push subscription. Admin subs keep using user_id;
-- viewer subs were previously fully anonymous.
alter table public.push_subscriptions
  add column if not exists visitor_token text;

-- The per-reader lookup path: find a reader's viewer subscriptions by token.
create index if not exists idx_push_subscriptions_visitor_token
  on public.push_subscriptions (visitor_token);
