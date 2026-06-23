-- More editable branding: the home hero headline, split into a plain lead and an
-- accent clause (the part shown in the ember gradient). Empty means "use the
-- localized default copy", so an untouched install is unchanged.
alter table public.site_settings
  add column if not exists hero_lead text not null default '',
  add column if not exists hero_accent text not null default '';
