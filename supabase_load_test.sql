-- BRUTAL LOAD TEST — millions of rows, small reused account pool.
-- v2: the original single-statement version hit "upstream timeout" on
-- whichever section first generated 500k+ rows in ONE statement. Rewritten
-- so every statement caps at ~100,000 generated base rows — fast and safe
-- under almost any statement timeout. Where the target is in the
-- millions, the instructions say "run this block N times" — because
-- random() is volatile, re-running the exact same statement produces
-- fresh random rows every time, so you just click Run repeatedly instead
-- of pasting N near-duplicate blocks.
--
-- Small (50,000), cheap, reused account pool — not a million separate
-- real accounts/uploads (real risk of Supabase abuse-detection / plan
-- limits / storage cost). Pulse images reuse Gemini's existing Unsplash
-- URLs (external, zero storage cost).
--
-- Tagged raw_user_meta_data->>'is_loadtest' = 'true' — wiped separately
-- from the curated demo pool via supabase_load_test_cleanup.sql.
--
-- RUN EACH NUMBERED BLOCK ON ITS OWN (select it, Run, repeat where noted).

-- ── 0. Index for the real bottleneck query (instant) ───────────────────────
create index if not exists emotions_grid_query_idx
  on public.emotions (is_active, inserted_at, lat, lng);

-- ── 1. Account pool: 50,000 accounts, ONE statement (fast, <5s typically) ──
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
from generate_series(1, 50000) as g
-- Safe to re-run: your first attempt may have already committed this
-- block before timing out on a later one. Skips accounts that exist.
where not exists (
  select 1 from auth.users u where u.email = 'loadtest-' || g || '@emomap.local'
);

-- ── 1b. Reusable random-pick mapping — run once. A REAL (not temporary)
-- table on purpose: you're about to run the blocks below as separate Run
-- clicks (to dodge the timeout), and the SQL editor may not reuse the same
-- DB connection/session across clicks — a temp table could vanish between
-- them. Dropped explicitly in step 7 once you're done. Every later block
-- reads this instead of auth.users directly, so none of them need their
-- own ORDER BY random() scan. ──────────────────────────────────────────────
drop table if exists public._lt_pool;
create table public._lt_pool as
select id, row_number() over () as rn
from auth.users
where raw_user_meta_data->>'is_loadtest' = 'true';

-- ── 2. Pulses: 5,000 posts, ONE statement ───────────────────────────────────
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

-- ── 3a. Likes — ~100k per run. RUN THIS BLOCK 5 TIMES for ~500k total. ─────
insert into public.reel_likes (reel_id, user_id, created_at)
select r.id, p.id, now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 1000) r
cross join generate_series(1, 100) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int
on conflict do nothing;

-- ── 3b. Comments — ~100k per run. RUN THIS BLOCK 2 TIMES for ~200k total. ──
insert into public.reel_comments (id, reel_id, user_id, body, created_at)
select
  gen_random_uuid(), r.id, p.id,
  (array['So good!!', 'Need to go here.', 'This is amazing', 'Wow just wow', 'Take me with you', 'Incredible shot', 'Living the dream', 'This made my day'])[1 + floor(random() * 8)::int],
  now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 1000) r
cross join generate_series(1, 100) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int;

-- ── 3c. Reposts — ~100k, ONE run is enough. ─────────────────────────────────
insert into public.reel_reposts (reel_id, user_id, created_at)
select r.id, p.id, now() - (floor(random() * 1000) || ' minutes')::interval
from (select id from public.reels order by random() limit 1000) r
cross join generate_series(1, 100) gs
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int
on conflict do nothing;

-- ── 4. Friendships — ~70k attempts (~60k+ new accepted rows) per run.
-- RUN THIS BLOCK 8 TIMES for ~500k total (ON CONFLICT also catches
-- duplicates across separate runs, not just within one). ───────────────────
insert into public.friendships (requester_id, addressee_id, status, created_at, responded_at)
select distinct on (least(a.id, b.id), greatest(a.id, b.id))
  least(a.id, b.id), greatest(a.id, b.id), 'accepted',
  now() - (floor(random() * 20000) || ' minutes')::interval,
  now() - (floor(random() * 20000) || ' minutes')::interval
from generate_series(1, 70000) g
join _lt_pool a on a.rn = 1 + floor(random() * 50000)::int
join _lt_pool b on b.rn = 1 + floor(random() * 50000)::int
where a.id <> b.id
on conflict (requester_id, addressee_id) do nothing;

-- ── 5. Messages — 100k per run. RUN THIS BLOCK 10 TIMES for ~1,000,000. ────
insert into public.messages (sender_id, recipient_id, body, created_at, read_at)
select
  a.id, b.id,
  (array['hey!', 'omg yes', 'see you there', 'on my way', 'haha true', 'can''t wait', 'just landed', 'this is wild', 'miss you', 'call me later'])[1 + floor(random() * 10)::int],
  now() - (floor(random() * 10000) || ' minutes')::interval,
  case when random() < 0.6 then now() - (floor(random() * 9000) || ' minutes')::interval else null end
from generate_series(1, 100000) g
join _lt_pool a on a.rn = 1 + floor(random() * 50000)::int
join _lt_pool b on b.rn = 1 + floor(random() * 50000)::int
where a.id <> b.id;

-- ── 6a. Emotions (historical, is_active=false) — 100k per run.
-- RUN THIS BLOCK 10 TIMES for ~1,000,000. ───────────────────────────────────
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  p.id, 'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  (random() * 170 - 85),
  (random() * 360 - 180),
  false,
  now() - (floor(random() * 20160) || ' minutes')::interval -- up to 14 days ago
from generate_series(1, 100000) g
join _lt_pool p on p.rn = 1 + floor(random() * 50000)::int;

-- ── 6b. Emotions ("active now") — 50,000, ONE run (one per pool account). ──
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  p.id, 'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  case when random() < 0.4 then
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

-- ── 7. Cleanup the helper table once you're done with all the above. ──────
drop table if exists public._lt_pool;

-- ── 8. Measure it. Run this and read the "Execution Time" line. ────────────
explain analyze
select * from public.get_mood_grid(-85, 85, -180, 180, 2.0, now() - interval '1 hour');
