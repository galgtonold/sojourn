-- ============================================================================
-- Sojourn — production-scale, SANITIZED local seed (QA).
-- Runs as the postgres superuser via `supabase db reset` (bypasses RLS).
-- All people/content are fictional. Photo URLs are public Unsplash stock
-- (images.unsplash.com is allowlisted in next.config.mjs).
--
-- Logins (local only):
--   owner@sojourn.test       / sojourn-admin     (role: owner)
--   collab@sojourn.test      / sojourn-collab    (role: member, granted 2 trips)
-- ============================================================================

-- ---- Auth users (direct insert so IDs are deterministic for content FKs) ----
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a1',
   'authenticated','authenticated','owner@sojourn.test', crypt('sojourn-admin', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false, '','','',''),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-0000000000a2',
   'authenticated','authenticated','collab@sojourn.test', crypt('sojourn-collab', gen_salt('bf')),
   now(), now(), now(), '{"provider":"email","providers":["email"]}','{}', false, '','','','');

insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at) values
  (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a1',
   jsonb_build_object('sub','00000000-0000-0000-0000-0000000000a1','email','owner@sojourn.test'),
   'email','00000000-0000-0000-0000-0000000000a1', now(), now(), now()),
  (gen_random_uuid(),'00000000-0000-0000-0000-0000000000a2',
   jsonb_build_object('sub','00000000-0000-0000-0000-0000000000a2','email','collab@sojourn.test'),
   'email','00000000-0000-0000-0000-0000000000a2', now(), now(), now());

-- Profiles, written explicitly.
--
-- This used to read "handle_new_user() created a 'member' profile for each;
-- promote the owner" — but 0043 dropped that trigger, because a trigger that
-- hands a profile to every new auth user also hands one to anyone who signs
-- themselves up, and a profile is where all authority in this schema comes
-- from. Both real paths (/api/setup and /api/admin/members) always wrote the
-- profile themselves with the service role; this seed is the third and now
-- does too.
insert into public.profiles (id, email, role) values
  ('00000000-0000-0000-0000-0000000000a1','owner@sojourn.test','owner'),
  ('00000000-0000-0000-0000-0000000000a2','collab@sojourn.test','member')
on conflict (id) do update
  set role = excluded.role, email = excluded.email;

-- ---- Site settings (singleton) ----
insert into public.site_settings (id, writing_style)
values (1, 'Erste Person, sinnlich und konkret. Kurze Sätze. Kein Marketing-Ton.')
on conflict (id) do update set writing_style = excluded.writing_style;

-- ---- Trips (8: published-rich, collaborator-managed, and an empty one) ----
insert into public.trips (id, slug, title, summary, cover_image, start_date, end_date, source_locale, i18n, translation_status) values
  ('11111111-0000-0000-0000-000000000001','patagonia-traverse','Patagonien-Durchquerung','Vierzehn Tage Wind, Granit und Gletscher im Süden.','https://images.unsplash.com/photo-1506905925346-21bda4d32df4','2025-03-01','2025-03-14','de', jsonb_build_object('en', jsonb_build_object('title','Patagonia Traverse','summary','Fourteen days of wind, granite and ice in the far south.')),'ready'),
  ('11111111-0000-0000-0000-000000000002','hokkaido-winter','Hokkaido im Winter','Pulverschnee, heiße Quellen und stille Wälder.','https://images.unsplash.com/photo-1493246507139-91e8fad9978e','2025-01-10','2025-01-22','de', jsonb_build_object('en', jsonb_build_object('title','Hokkaido in Winter','summary','Powder snow, hot springs and silent forests.')),'ready'),
  ('11111111-0000-0000-0000-000000000003','dolomites-high-route','Dolomiten-Höhenweg','Klettersteige und Hütten über drei Wochen.','https://images.unsplash.com/photo-1469474968028-56623f02e42e','2024-09-01','2024-09-20','en', jsonb_build_object('de', jsonb_build_object('title','Dolomiten-Höhenweg','summary','Klettersteige und Hütten über drei Wochen.')),'ready'),
  ('11111111-0000-0000-0000-000000000004','atlas-mountains','Atlasgebirge','Berberdörfer und der Toubkal.','https://images.unsplash.com/photo-1454496522488-7a8e488e8606','2024-05-05','2024-05-15','de','{}','none'),
  ('11111111-0000-0000-0000-000000000005','norwegian-fjords','Norwegische Fjorde','Von Bergen bis zu den Lofoten.','https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05','2024-07-01','2024-07-18','de', jsonb_build_object('en', jsonb_build_object('title','Norwegian Fjords','summary','From Bergen up to the Lofoten islands.')),'pending'),
  ('11111111-0000-0000-0000-000000000006','iceland-ring-road','Island-Ringstraße','3300 Kilometer rund um die Insel.','https://images.unsplash.com/photo-1500534623283-312aade485b7','2023-08-01','2023-08-14','de', jsonb_build_object('en', jsonb_build_object('title','Iceland Ring Road','summary','3300 km around the island.')),'error'),
  ('11111111-0000-0000-0000-000000000007','solo-test-trip','Solo-Test-Tour','Von einer Mitstreiterin verwaltet.','https://images.unsplash.com/photo-1441974231531-c6227db76b6e',null,null,'de','{}','none'),
  ('11111111-0000-0000-0000-000000000008','empty-expedition','Leere Expedition','Noch keine Einträge.',null,null,null,'de','{}','none');

-- Collaborator gets edit access to two trips.
insert into public.trip_members (trip_id, user_id) values
  ('11111111-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a2'),
  ('11111111-0000-0000-0000-000000000007','00000000-0000-0000-0000-0000000000a2');

-- ---- Rich, hand-authored posts (deterministic IDs for inline refs) ----
insert into public.posts (id, slug, title, excerpt, body, cover_image, cover_alt, trip_id, location, lat, lng, published, published_at, source_locale, i18n, translation_status) values
  ('22222222-0000-0000-0000-000000000001','dawn-on-cerro-torre','Morgengrauen am Cerro Torre',
   'Wir verließen das Camp um drei. Der Granit glühte, bevor die Sonne den Grat erreichte.',
   E'Wir verließen das Camp um drei Uhr morgens. Die Stirnlampen zeichneten kleine Kegel in den Wind.\n\n[photo:33333333-0000-0000-0000-000000000001]\n\nAls das erste Licht kam, glühte der Granit wie eine Kohle. Niemand sprach.\n\n[ask:44444444-0000-0000-0000-000000000001]\n\n## Der Aufstieg\n\nDer Pfad zog sich endlos. Jeder Schritt war ein kleiner Handel mit dem Wind.\n\n[photo:33333333-0000-0000-0000-000000000002]\n\nOben dann: Stille, und ein Horizont aus Eis.\n\n[ask:44444444-0000-0000-0000-000000000002]',
   'https://images.unsplash.com/photo-1506905925346-21bda4d32df4','Granitturm im Morgenlicht',
   '11111111-0000-0000-0000-000000000001','El Chaltén, Argentinien',-49.33,-72.99, true, now() - interval '40 days','de',
   jsonb_build_object('en', jsonb_build_object('title','Dawn on Cerro Torre','excerpt','We left camp at three. The granite glowed before the sun reached the ridge.','body', E'We left camp at three in the morning. Headlamps cut small cones into the wind.\n\n[photo:33333333-0000-0000-0000-000000000001]\n\nWhen the first light came, the granite glowed like a coal. No one spoke.\n\n[ask:44444444-0000-0000-0000-000000000001]\n\n## The climb\n\nThe path went on forever. Every step a small bargain with the wind.\n\n[photo:33333333-0000-0000-0000-000000000002]\n\nThen, at the top: silence, and a horizon of ice.\n\n[ask:44444444-0000-0000-0000-000000000002]')),'ready'),
  ('22222222-0000-0000-0000-000000000002','blue-ice-and-noise','Blaues Eis und viel Lärm',
   'Ein Turm aus altem Eis kalbte in den See — so groß wie ein Haus.',
   E'Der Gletscher arbeitet ununterbrochen. Man hört ihn, bevor man ihn sieht.\n\nEin Knall wie ein Schuss, dann Stille, dann das Donnern.',
   'https://images.unsplash.com/photo-1500534623283-312aade485b7','Blaue Gletscherwand',
   '11111111-0000-0000-0000-000000000001','Los Glaciares NP, Argentinien',-50.49,-73.05, true, now() - interval '38 days','en',
   jsonb_build_object('de', jsonb_build_object('title','Blaues Eis und viel Lärm','excerpt','Ein Turm aus altem Eis kalbte in den See — so groß wie ein Haus.')),'ready'),
  ('22222222-0000-0000-0000-000000000003','snow-light-in-biei','Schneelicht in Biei',
   'Temples in Schnee, der Geruch von gerösteten Kastanien.',
   E'In Biei ist die Welt weiß auf weiß. Die Bäume stehen wie Tinte auf Papier.',
   'https://images.unsplash.com/photo-1493246507139-91e8fad9978e','Verschneite Bäume',
   '11111111-0000-0000-0000-000000000002','Biei, Hokkaido',43.59,142.46, true, now() - interval '120 days','de','{}','none'),
  ('22222222-0000-0000-0000-000000000004','a-note-without-a-trip','Eine Notiz ohne Reise',
   'Manche Einträge gehören zu keiner Reise.',
   E'Dieser Eintrag hat absichtlich keine Reise — ein Test für lose Beiträge.',
   'https://images.unsplash.com/photo-1444723121867-7a241cacace9',null,
   null,'Unterwegs',48.14,11.58, true, now() - interval '5 days','de','{}','none'),
  ('22222222-0000-0000-0000-000000000005','draft-not-public','Entwurf — nicht öffentlich',
   'Dieser Entwurf darf öffentlich nicht erscheinen.',
   E'Wenn du das ohne Login siehst, ist etwas kaputt.',
   null,null,
   '11111111-0000-0000-0000-000000000005','Bergen, Norwegen',60.39,5.32, false, null,'de','{}','none'),
  ('22222222-0000-0000-0000-000000000006','collab-post-with-edges','Ein langer Titel mit 😀 Emoji und <b>HTML</b> & Sonderzeichen, der bewusst die Zeilenumbrüche und das Layout der Karten auf Übersichtsseiten strapaziert',
   'Rand-Test: Emoji, HTML im Text, und ein sehr langer Titel.',
   E'Markdown-Injektion testen: <script>alert(1)</script> und ![x](javascript:alert(1)).\n\n> Ein Zitat.\n\n- Punkt eins\n- Punkt zwei\n\n**Fett** und *kursiv* und `code`.',
   'https://images.unsplash.com/photo-1469474968028-56623f02e42e','Bergpanorama',
   '11111111-0000-0000-0000-000000000003','Tre Cime, Italien',46.62,12.30, true, now() - interval '200 days','de','{}','none');

-- Photos referenced by [photo:] tags (deterministic IDs) + extra gallery photos.
insert into public.photos (id, post_id, url, caption, alt, width, height, blurhash, lat, lng, taken_at, sort_order) values
  ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','https://images.unsplash.com/photo-1454496522488-7a8e488e8606','Stirnlampen im Wind','Wanderer mit Stirnlampen vor Granit',1920,1280,'LEHV6nWB2yk8pyo0adR*.7kCMdnj',-49.33,-72.99, now() - interval '40 days', 0),
  ('33333333-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','https://images.unsplash.com/photo-1426604966848-d7adac402bff','Gipfel im ersten Licht','Granitgipfel im Morgenrot',1920,1280,'L9AB*A%LPC%2.AxutRofo}D%M{Rj',-49.31,-72.97, now() - interval '40 days', 1),
  -- a photo with NO geodata (edge case)
  (gen_random_uuid(),'22222222-0000-0000-0000-000000000001','https://images.unsplash.com/photo-1502082553048-f009c37129b9','Ohne GPS','Waldweg ohne Koordinaten',1600,1067,'LKO2:N%2Tw=w]~RBVZRi};RPxuwH',null,null, now() - interval '40 days', 2),
  ('33333333-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000002','https://images.unsplash.com/photo-1500534623283-312aade485b7','Kalbende Wand','Blaue Eiswand',2048,1365,'LEHV6nWB2yk8pyo0adR*.7kCMdnj',-50.49,-73.05, now() - interval '38 days', 0);

-- Interactions referenced by [ask:] tags (a poll and a quiz, with i18n).
insert into public.interactions (id, post_id, kind, question, options, correct_index, explanation, sort_order, i18n) values
  ('44444444-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','poll','Wann brichst du zu so einer Tour auf?',
   '["Vor Sonnenaufgang","Nach dem Frühstück","Am Nachmittag","Niemals freiwillig"]'::jsonb, null, null, 0,
   jsonb_build_object('en', jsonb_build_object('question','When do you start a hike like this?','options', jsonb_build_array('Before sunrise','After breakfast','In the afternoon','Never willingly')))),
  ('44444444-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','quiz','Wie hoch ist der Cerro Torre (ungefähr)?',
   '["1500 m","3100 m","5000 m","8000 m"]'::jsonb, 1, 'Der Cerro Torre misst etwa 3128 m.', 1,
   jsonb_build_object('en', jsonb_build_object('question','How tall is Cerro Torre (roughly)?','options', jsonb_build_array('1500 m','3100 m','5000 m','8000 m'),'explanation','Cerro Torre is about 3128 m.')));

-- Locations (map pins) for trips that have a map.
insert into public.locations (post_id, trip_id, name, lat, lng, day, sort_order) values
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','El Chaltén',-49.33,-72.89,1,0),
  ('22222222-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Laguna Torre',-49.30,-73.02,1,1),
  ('22222222-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','Perito Moreno',-50.49,-73.05,3,2),
  ('22222222-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000002','Biei',43.59,142.46,1,0),
  (null,'11111111-0000-0000-0000-000000000003','Tre Cime',46.62,12.30,1,0),
  (null,'11111111-0000-0000-0000-000000000005','Bergen',60.39,5.32,1,0),
  (null,'11111111-0000-0000-0000-000000000005','Lofoten',68.20,13.62,7,1);

-- GPX tracks (3D coordinates so the elevation profile renders).
-- geojson shape: FeatureCollection > Feature > geometry(LineString) > coordinates[[lng,lat,ele],...]
insert into public.tracks (post_id, trip_id, name, distance_m, geojson)
select '22222222-0000-0000-0000-000000000001'::uuid,'11111111-0000-0000-0000-000000000001'::uuid,'Laguna Torre Trail',8200,
  jsonb_build_object(
    'type','FeatureCollection',
    'features', jsonb_build_array(jsonb_build_object(
      'type','Feature',
      'properties', jsonb_build_object('name','Laguna Torre Trail'),
      'geometry', jsonb_build_object(
        'type','LineString',
        'coordinates', jsonb_build_array(
          jsonb_build_array(-72.89,-49.33,405),
          jsonb_build_array(-72.93,-49.32,520),
          jsonb_build_array(-72.97,-49.31,690),
          jsonb_build_array(-73.00,-49.30,840),
          jsonb_build_array(-73.02,-49.30,610))))))
union all
select '22222222-0000-0000-0000-000000000002'::uuid,'11111111-0000-0000-0000-000000000001'::uuid,'Glacier Boardwalk',2100,
  jsonb_build_object(
    'type','FeatureCollection',
    'features', jsonb_build_array(jsonb_build_object(
      'type','Feature',
      'properties', jsonb_build_object('name','Glacier Boardwalk'),
      'geometry', jsonb_build_object(
        'type','LineString',
        'coordinates', jsonb_build_array(
          jsonb_build_array(-73.05,-50.49,180),
          jsonb_build_array(-73.06,-50.48,210),
          jsonb_build_array(-73.07,-50.47,240))))));

-- ---- A deep comment thread + moderation edge cases on the rich post ----
insert into public.comments (id, post_id, parent_id, author_name, body, hidden, created_at) values
  ('55555555-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001', null,'Mara','Was für ein Aufbruch! Wie kalt war es?', false, now() - interval '39 days'),
  ('55555555-0000-0000-0000-000000000002','22222222-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000001','Autor','Etwa minus acht, mit Wind gefühlt minus zwanzig.', false, now() - interval '39 days' + interval '2 hours'),
  ('55555555-0000-0000-0000-000000000003','22222222-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000002','Mara','Wahnsinn. Danke!', false, now() - interval '38 days'),
  ('55555555-0000-0000-0000-000000000004','22222222-0000-0000-0000-000000000001', null,'Spammer','GRATIS schuhe auf billig-link.example', true, now() - interval '37 days'),
  -- reply whose parent is hidden (orphan-promotion test)
  ('55555555-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000004','Lena','Antwort auf einen versteckten Kommentar.', false, now() - interval '36 days');

-- ---- Bulk posts to reach production scale (44; ~1 in 7 a draft) ----
insert into public.posts (id, slug, title, excerpt, body, trip_id, location, lat, lng, published, published_at, source_locale, i18n, translation_status, created_at)
select
  gen_random_uuid(),
  'bulk-' || to_char(g,'FM000'),
  'Tag ' || g || ' — ' || (array['Aufbruch','Pass','Gletscher','Fjord','Wald','Küste','Gipfel','Tal'])[1 + (g % 8)],
  'Kurzer Auszug für Eintrag ' || g || '. Wind, Wetter, und ein langer Weg.',
  'Markdown-Text für Eintrag ' || g || '. ' || repeat('Ein Satz über die Etappe und das Licht. ', 10),
  (array['11111111-0000-0000-0000-000000000001'::uuid,'11111111-0000-0000-0000-000000000002'::uuid,'11111111-0000-0000-0000-000000000004'::uuid,'11111111-0000-0000-0000-000000000005'::uuid,'11111111-0000-0000-0000-000000000006'::uuid])[1 + (g % 5)],
  (array['Patagonien','Hokkaido','Atlas','Norwegen','Island'])[1 + (g % 5)],
  (-60 + (g % 100))::double precision, (-75 + (g % 150))::double precision,
  (g % 7 <> 0),
  case when (g % 7 <> 0) then now() - (g || ' days')::interval else null end,
  'de',
  jsonb_build_object('en', jsonb_build_object('title','Day ' || g || ' — stage','excerpt','Short excerpt for entry ' || g || '.')),
  'ready',
  now() - (g || ' days')::interval
from generate_series(1,44) as g;

-- One photo per bulk post (varied stock image; valid blurhash; geodata follows the post).
insert into public.photos (id, post_id, url, caption, alt, width, height, blurhash, lat, lng, taken_at, sort_order)
select gen_random_uuid(), p.id,
  (array[
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e',
    'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05',
    'https://images.unsplash.com/photo-1441974231531-c6227db76b6e',
    'https://images.unsplash.com/photo-1454496522488-7a8e488e8606',
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff',
    'https://images.unsplash.com/photo-1500534623283-312aade485b7',
    'https://images.unsplash.com/photo-1502082553048-f009c37129b9'
  ])[1 + (abs(hashtext(p.id::text)) % 8)],
  'Foto zu ' || p.title, 'Landschaftsfoto', 1920, 1280, 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
  p.lat, p.lng, p.published_at, 0
from public.posts p where p.slug like 'bulk-%';

-- Reactions across all published posts (distinct visitor tokens; all four kinds).
insert into public.reactions (post_id, kind, visitor_token)
select p.id, (array['heart','fire','wow','star'])[1 + (g % 4)], 'tok-' || left(replace(p.id::text,'-',''),8) || '-' || g
from public.posts p cross join generate_series(1,40) as g
where p.published;

-- A handful of comments on every published post.
insert into public.comments (post_id, author_name, body, created_at)
select p.id, (array['Mara','Jonas','Lena','Tomas','Anya'])[1 + (g % 5)],
  'Kommentar ' || g || ' — großartige Etappe!', now() - (g || ' hours')::interval
from public.posts p cross join generate_series(1,5) as g
where p.published;

-- A 220-comment thread on one post to exercise pagination ("load earlier" past 200).
insert into public.comments (post_id, author_name, body, created_at)
select '22222222-0000-0000-0000-000000000002', 'Gast ' || g, 'Massenkommentar #' || g,
  now() - (g || ' minutes')::interval
from generate_series(1,220) as g;

-- Some comment likes (distinct tokens).
insert into public.comment_likes (comment_id, visitor_token)
select c.id, 'like-' || g
from public.comments c cross join generate_series(1,3) as g
where c.id in ('55555555-0000-0000-0000-000000000001','55555555-0000-0000-0000-000000000002');

-- An extra poll on a bulk post (no quiz answer) for variety.
insert into public.interactions (post_id, kind, question, options, sort_order)
select id, 'poll', 'Wie würdest du diese Etappe bewerten?', '["Leicht","Mittel","Hart","Brutal"]'::jsonb, 0
from public.posts where slug = 'bulk-010';
