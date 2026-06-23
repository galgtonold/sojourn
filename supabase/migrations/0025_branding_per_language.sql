-- Branding copy becomes per-language (de/en), and the home hero's "intro line"
-- (kicker, e.g. "Notizen von unterwegs, leicht übertrieben") joins it. The site
-- name stays a single value (a proper noun). Empty in a language means "use the
-- localized default" for that language.
--
-- The old single-value columns (tagline, hero_lead, hero_accent from 0023/0024)
-- are left in place — dropping them here would break the still-running previous
-- deploy that reads them. Their values are copied into both language columns so
-- nothing already set is lost.
alter table public.site_settings
  add column if not exists tagline_de text not null default '',
  add column if not exists tagline_en text not null default '',
  add column if not exists hero_lead_de text not null default '',
  add column if not exists hero_lead_en text not null default '',
  add column if not exists hero_accent_de text not null default '',
  add column if not exists hero_accent_en text not null default '',
  add column if not exists kicker_de text not null default '',
  add column if not exists kicker_en text not null default '';

update public.site_settings set
  tagline_de = tagline,
  tagline_en = tagline,
  hero_lead_de = hero_lead,
  hero_lead_en = hero_lead,
  hero_accent_de = hero_accent,
  hero_accent_en = hero_accent
where id = 1
  and tagline_de = ''
  and tagline_en = ''
  and hero_lead_de = ''
  and hero_lead_en = ''
  and hero_accent_de = ''
  and hero_accent_en = '';
