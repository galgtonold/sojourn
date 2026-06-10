-- Blog-wide settings (single row). Holds the author's global writing-style
-- guide, which feeds every AI draft so generated prose matches their voice.
create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  writing_style text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

-- Internal guidance: any signed-in admin/contributor may read it (it feeds the
-- authenticated generation routes); writes go through the service role behind an
-- owner check, so there is no client write policy.
create policy "site_settings read (authenticated)"
  on public.site_settings for select to authenticated using (true);

create trigger trg_site_settings_touch
  before update on public.site_settings
  for each row execute function public.touch_updated_at();
