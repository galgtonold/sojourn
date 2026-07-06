-- Photo gallery ordering: remember whether the author hand-arranged a post's
-- photos. When false (the default), the gallery auto-orders by capture time
-- after each upload; once the author drags photos into a custom order it flips
-- true so later uploads append instead of reshuffling their arrangement.
alter table public.posts
  add column if not exists photos_manual_order boolean not null default false;
