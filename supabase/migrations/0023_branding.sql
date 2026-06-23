-- Editable branding: the site name and tagline shown across the site, set from
-- the admin instead of hard-coded. Empty means "use the built-in default" (the
-- NEXT_PUBLIC_SITE_NAME env value for the name, the localized i18n copy for the
-- tagline), so an untouched install behaves exactly as before.
alter table public.site_settings
  add column if not exists site_name text not null default '',
  add column if not exists tagline text not null default '';
