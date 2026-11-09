-- BRUTAL LOAD TEST — millions of rows, small reused account pool.
-- Explicit user request (2026-11-09): "brutális mennyiséget... millios
-- nagyságrendben! posztokat is tolj, képeket, chat-eket,
-- barátmeghívásokat, mindent egyszerre!" — simulate the app already being
-- used by the whole world, at real scale, to see if it survives.
--
-- DELIBERATELY NOT "a million separate real accounts + real uploaded
-- files" — that would mean a million new auth.users rows (real risk of
-- tripping Supabase's own abuse detection / plan limits) and real storage
-- spend for images nobody will ever look at. Instead: a SMALL (50,000),
-- cheap, reused account pool generating MILLIONS of rows across every
-- table — this is what actually determines whether the app survives a
-- viral spike (query/aggregation load at huge row counts + many
-- concurrent active users), not literally how many AUTH accounts exist.
-- Pulse images reuse Gemini's existing Unsplash URLs (external, free,
-- zero storage cost) — nothing is uploaded to the real storage bucket.
--
-- Tagged raw_user_meta_data->>'is_loadtest' = 'true' — completely separate
-- from the "nice" demo/friends pool (is_demo) so it can be wiped on its
-- own with supabase_load_test_cleanup.sql without touching the curated
-- demo data.
--
-- RUN THIS IN THE NUMBERED SECTIONS BELOW, ONE AT A TIME, if the SQL
-- editor's statement timeout cuts off a single big paste. Each section
-- ends with its own COMMIT, so earlier sections stay done even if a
-- later one times out and needs re-running on its own.

-- ============================================================================
-- 0. Performance: composite index for the real bottleneck query
-- (get_mood_grid filters is_active + inserted_at + a lat/lng bounding box
-- together — a single covering index avoids a bitmap-AND of two separate
-- indexes once the active+recent set itself is large).
-- ============================================================================
create index if not exists emotions_grid_query_idx
  on public.emotions (is_active, inserted_at, lat, lng);
commit;

-- ============================================================================
-- 1. The account pool: 50,000 accounts (fast — this is the ONLY place
-- auth.users grows, and 50k is trivial, not "a million users").
-- ============================================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated', 'authenticated',
  'loadtest-' || g || '@emomap.local',
  crypt('loadtest-' || g, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', 'lt_' || lpad(g::text, 5, '0'), 'is_loadtest', true),
  now(), now(), '', '', '', ''
from generate_series(1, 50000) as g;
commit;

-- Reusable mapping: rn (1..50000) -> account id, so every later section can
-- pick "a random pool member" via a cheap equality join instead of
-- ORDER BY random() (which would force a full sort of 50k rows on every
-- one of a million calls — correct results, catastrophic performance).
create temporary table _lt_pool as
select id, row_number() over () as rn
from auth.users
where raw_user_meta_data->>'is_loadtest' = 'true';
commit;

-- ============================================================================
-- 2. Pulses: 5,000 new posts, reusing Gemini's existing Unsplash URLs
-- (cycled — no new images, zero storage cost), random owner from the pool.
-- ============================================================================
insert into public.reels (id, user_id, image_url, caption, emotion, created_at, expires_at)
select
  gen_random_uuid(),
  p.id,
  (array[
    'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1496868834840-5f4c98840aaa?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1080&q=85',
    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1080&q=85'
  ])[1 + floor(random() * 10)::int],
  (array[
    'Living for this moment right now.', 'Can''t stop smiling today.',
    'This city never disappoints.', 'Best decision I made all week.',
    'Energy is unreal tonight.', 'Just vibing, nothing else matters.',
    'Grateful for days like this.', 'Tell me this isn''t perfect.',
    'Running on pure adrenaline.', 'Quiet moment before the chaos.'
  ])[1 + floor(random() * 10)::int],
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  now() - (floor(random() * 1200) || ' minutes')::interval,
  now() - (floor(random() * 1200) || ' minutes')::interval + interval '24 hours'
from generate_series(1, 5000) g
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int;
commit;

-- ============================================================================
-- 3. Likes, comments, reposts on ALL Pulses (new + Gemini's original 10) —
-- ~500k / ~200k / ~100k. Target count = (reels sampled) x (per-reel
-- multiplier); ON CONFLICT handles any (reel,user) collisions on likes/
-- reposts. Each candidate row re-rolls its own random pool member via the
-- rn equality join, so this is genuinely a fresh random pick per row, not
-- the same one repeated.
-- ============================================================================
insert into public.reel_likes (reel_id, user_id, created_at)
select r.id, p.id, now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 5010) r
cross join generate_series(1, 120) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int
on conflict do nothing;
commit;

insert into public.reel_comments (id, reel_id, user_id, body, created_at)
select
  gen_random_uuid(), r.id, p.id,
  (array['So good!!', 'Need to go here.', 'This is amazing', 'Wow just wow', 'Take me with you', 'Incredible shot', 'Living the dream', 'This made my day'])[1 + floor(random() * 8)::int],
  now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 5010) r
cross join generate_series(1, 40) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int;
commit;

insert into public.reel_reposts (reel_id, user_id, created_at)
select r.id, p.id, now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 5010) r
cross join generate_series(1, 20) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int
on conflict do nothing;
commit;

-- ============================================================================
-- 4. Friendships: ~500k accepted connections across the pool. least/greatest
-- dedupe before insert so the unique(requester_id, addressee_id) constraint
-- doesn't just silently drop half the attempt.
-- ============================================================================
insert into public.friendships (requester_id, addressee_id, status, created_at, responded_at)
select distinct on (least(a.id, b.id), greatest(a.id, b.id))
  least(a.id, b.id), greatest(a.id, b.id), 'accepted',
  now() - (floor(random() * 20000) || ' minutes')::interval,
  now() - (floor(random() * 20000) || ' minutes')::interval
from generate_series(1, 700000) g
join _lt_pool a on a.rn = 1 + floor(random() * 50000)::int
join _lt_pool b on b.rn = 1 + floor(random() * 50000)::int
where a.id <> b.id
on conflict (requester_id, addressee_id) do nothing;
commit;

-- ============================================================================
-- 5. Messages: ~1,000,000 across random pairs in the pool (RLS is bypassed
-- running as the SQL editor's role, so no actual friendship is required
-- for this synthetic load — only for the real app's own insert path).
-- ============================================================================
insert into public.messages (sender_id, recipient_id, body, created_at, read_at)
select
  a.id, b.id,
  (array['hey!', 'omg yes', 'see you there', 'on my way', 'haha true', 'can''t wait', 'just landed', 'this is wild', 'miss you', 'call me later'])[1 + floor(random() * 10)::int],
  now() - (floor(random() * 10000) || ' minutes')::interval,
  case when random() < 0.6 then now() - (floor(random() * 9000) || ' minutes')::interval else null end
from generate_series(1, 1000000) g
join _lt_pool a on a.rn = 1 + floor(random() * 50000)::int
join _lt_pool b on b.rn = 1 + floor(random() * 50000)::int
where a.id <> b.id;
commit;

-- ============================================================================
-- 6. Emotions: ~1,000,000 historical (is_active=false, spread over 14 days
-- — table-size load, invisible on the live map by design) + 50,000 "right
-- now" (is_active=true, one per pool account, within the last 50 minutes
-- — this is the slice that actually stresses get_mood_grid at real scale).
-- ============================================================================
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  p.id, 'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  (random() * 170 - 85),
  (random() * 360 - 180),
  false,
  now() - (floor(random() * 20160) || ' minutes')::interval -- up to 14 days ago
from generate_series(1, 1000000) g
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int;
commit;

insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  p.id, 'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  case when random() < 0.4 then
    -- 40% clustered near a real city (reuses the existing hotspot cities)
    (array[35.6762,40.7128,51.5074,48.8566,19.0760,-23.5505,52.5200,35.6895,47.4979,25.2048])[1+floor(random()*10)::int]
      + (random() - 0.5) * 0.3
  else
    (random() * 170 - 85)
  end,
  case when random() < 0.4 then
    (array[139.6503,-74.0060,-0.1278,2.3522,72.8777,-46.6333,13.4050,139.6917,19.0402,55.2708])[1+floor(random()*10)::int]
      + (random() - 0.5) * 0.3
  else
    (random() * 360 - 180)
  end,
  true,
  now() - (floor(random() * 50) || ' minutes')::interval
from _lt_pool p;
commit;

drop table _lt_pool;

-- ============================================================================
-- 7. Measure it. Run this and look at the "Execution Time" line — this is
-- the actual number that answers "does the app survive a viral spike".
-- Bounding box below = roughly the whole world at a low zoom.
-- ============================================================================
explain analyze
select * from public.get_mood_grid(-85, 85, -180, 180, 2.0, now() - interval '1 hour');
