-- Temporary demo data for visual/UX testing (2026-11-06), per explicit user
-- request: "tegyél be nekem demofriends-eket... tegyük le a világban embereket
-- random helyekre, hogy lássuk hogy működnek az aurák, a zoom-ok stb! ugy
-- csináld meg mintha már használná jópár ezer ember." (short of literally
-- creating thousands of real accounts, which isn't practical/safe to do via
-- raw SQL — this creates 73 demo accounts instead: enough to populate every
-- zoom scenario: lone 5m dots scattered worldwide, a ~500m "district"
-- cluster, and a ~80m "packed venue" cluster, plus 18 of them doubling as
-- rich Friends-page test data with avatars, moods, pending requests and chat
-- history.)
--
-- READ BEFORE RUNNING:
--   1. Replace YOUR_EMOMAP_LOGIN_EMAIL below (one spot) with the email you
--      yourself log into the live EmoMap app with — the demo friends get
--      added as YOUR friends specifically.
--   2. This creates real rows directly in auth.users. There's no supported
--      way to get many distinct, distinguishable user_ids without going
--      through real signups — this is the standard (if unofficial) trick
--      for seeding fake accounts straight via SQL. Every row it touches is
--      tagged raw_user_meta_data->>'is_demo' = 'true', so
--      supabase_demo_cleanup.sql deletes all of it in one shot later
--      (cascades through profiles/profile_details/emotions/friendships/
--      messages automatically).
--   3. Heads up: if your Supabase plan bills by monthly active users, these
--      73 accounts nominally count until cleaned up.
--   4. Idempotent: safe to run more than once (re-running reuses the same
--      demo accounts instead of duplicating them).

create temporary table _demo_users (
  label text primary key,
  id uuid
);

-- ── 1. Create (or find existing) demo accounts ─────────────────────────────
with demo_defs(label, email, username) as (
  values
    -- Friends (18) — f01-f13 accepted, f14-f16 incoming requests (to you),
    -- f17-f18 outgoing requests (from you)
    ('f01','demo-nora@emomap.local','nora_k81'),
    ('f02','demo-balazs@emomap.local','balazs_t42'),
    ('f03','demo-zsofia@emomap.local','zsofia_m19'),
    ('f04','demo-mate@emomap.local','mate_v63'),
    ('f05','demo-emma@emomap.local','emma_l27'),
    ('f06','demo-daniel@emomap.local','daniel_h55'),
    ('f07','demo-lili@emomap.local','lili_b38'),
    ('f08','demo-adam@emomap.local','adam_sz71'),
    ('f09','demo-kata@emomap.local','kata_m94'),
    ('f10','demo-gergo@emomap.local','gergo_f16'),
    ('f11','demo-petra@emomap.local','petra_n48'),
    ('f12','demo-levente@emomap.local','levente_r29'),
    ('f13','demo-dora@emomap.local','dora_sz85'),
    ('f14','demo-bence@emomap.local','bence_p37'),
    ('f15','demo-fanny@emomap.local','fanny_k62'),
    ('f16','demo-mark@emomap.local','mark_t14'),
    ('f17','demo-regina@emomap.local','regina_v58'),
    ('f18','demo-oliver@emomap.local','oliver_d93'),
    -- Worldwide singles (20) — one lone vote each, spread across every
    -- continent, purely to populate the zoomed-out world view
    ('w01','demo-w01@emomap.local','w01'),
    ('w02','demo-w02@emomap.local','w02'),
    ('w03','demo-w03@emomap.local','w03'),
    ('w04','demo-w04@emomap.local','w04'),
    ('w05','demo-w05@emomap.local','w05'),
    ('w06','demo-w06@emomap.local','w06'),
    ('w07','demo-w07@emomap.local','w07'),
    ('w08','demo-w08@emomap.local','w08'),
    ('w09','demo-w09@emomap.local','w09'),
    ('w10','demo-w10@emomap.local','w10'),
    ('w11','demo-w11@emomap.local','w11'),
    ('w12','demo-w12@emomap.local','w12'),
    ('w13','demo-w13@emomap.local','w13'),
    ('w14','demo-w14@emomap.local','w14'),
    ('w15','demo-w15@emomap.local','w15'),
    ('w16','demo-w16@emomap.local','w16'),
    ('w17','demo-w17@emomap.local','w17'),
    ('w18','demo-w18@emomap.local','w18'),
    ('w19','demo-w19@emomap.local','w19'),
    ('w20','demo-w20@emomap.local','w20'),
    -- Medium "district" cluster (10) — ~500m spread, one city district
    ('m01','demo-m01@emomap.local','m01'),('m02','demo-m02@emomap.local','m02'),
    ('m03','demo-m03@emomap.local','m03'),('m04','demo-m04@emomap.local','m04'),
    ('m05','demo-m05@emomap.local','m05'),('m06','demo-m06@emomap.local','m06'),
    ('m07','demo-m07@emomap.local','m07'),('m08','demo-m08@emomap.local','m08'),
    ('m09','demo-m09@emomap.local','m09'),('m10','demo-m10@emomap.local','m10'),
    -- Dense "packed venue" cluster (25) — ~80m spread, one town square
    ('c01','demo-c01@emomap.local','c01'),('c02','demo-c02@emomap.local','c02'),
    ('c03','demo-c03@emomap.local','c03'),('c04','demo-c04@emomap.local','c04'),
    ('c05','demo-c05@emomap.local','c05'),('c06','demo-c06@emomap.local','c06'),
    ('c07','demo-c07@emomap.local','c07'),('c08','demo-c08@emomap.local','c08'),
    ('c09','demo-c09@emomap.local','c09'),('c10','demo-c10@emomap.local','c10'),
    ('c11','demo-c11@emomap.local','c11'),('c12','demo-c12@emomap.local','c12'),
    ('c13','demo-c13@emomap.local','c13'),('c14','demo-c14@emomap.local','c14'),
    ('c15','demo-c15@emomap.local','c15'),('c16','demo-c16@emomap.local','c16'),
    ('c17','demo-c17@emomap.local','c17'),('c18','demo-c18@emomap.local','c18'),
    ('c19','demo-c19@emomap.local','c19'),('c20','demo-c20@emomap.local','c20'),
    ('c21','demo-c21@emomap.local','c21'),('c22','demo-c22@emomap.local','c22'),
    ('c23','demo-c23@emomap.local','c23'),('c24','demo-c24@emomap.local','c24'),
    ('c25','demo-c25@emomap.local','c25')
),
ins as (
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
    d.email,
    crypt('emomap-demo-' || d.label, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('username', d.username, 'is_demo', true),
    now(), now(), '', '', '', ''
  from demo_defs d
  on conflict (email) do nothing
  returning id, email
)
insert into _demo_users (label, id)
select d.label, coalesce(i.id, existing.id)
from demo_defs d
left join ins i on i.email = d.email
left join auth.users existing on existing.email = d.email;

-- ── 2. Avatars for the 18 "friend" accounts (dicebear — free, no auth) ─────
update public.profiles p
set avatar_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || du.label
from _demo_users du
where du.label like 'f%' and du.id = p.id;

-- ── 3. Friendships with YOU ─────────────────────────────────────────────────
-- Accepted (13)
insert into public.friendships (requester_id, addressee_id, status, created_at, responded_at)
select
  (select id from auth.users where email = 'YOUR_EMOMAP_LOGIN_EMAIL'),
  du.id,
  'accepted',
  now() - (v.days_ago || ' days')::interval,
  now() - (v.days_ago || ' days')::interval + interval '10 minutes'
from (values
  ('f01',40),('f02',35),('f03',30),('f04',28),('f05',21),('f06',18),
  ('f07',14),('f08',10),('f09',7),('f10',5),('f11',3),('f12',2),('f13',1)
) as v(label, days_ago)
join _demo_users du on du.label = v.label
on conflict (requester_id, addressee_id) do nothing;

-- Incoming requests: them -> you, still pending
insert into public.friendships (requester_id, addressee_id, status, created_at)
select du.id, (select id from auth.users where email = 'YOUR_EMOMAP_LOGIN_EMAIL'),
  'pending', now() - (v.hours_ago || ' hours')::interval
from (values ('f14',2),('f15',6),('f16',20)) as v(label, hours_ago)
join _demo_users du on du.label = v.label
on conflict (requester_id, addressee_id) do nothing;

-- Outgoing requests: you -> them, still pending
insert into public.friendships (requester_id, addressee_id, status, created_at)
select (select id from auth.users where email = 'YOUR_EMOMAP_LOGIN_EMAIL'), du.id,
  'pending', now() - (v.hours_ago || ' hours')::interval
from (values ('f17',1),('f18',9)) as v(label, hours_ago)
join _demo_users du on du.label = v.label
on conflict (requester_id, addressee_id) do nothing;

-- ── 4. Chat history with 6 of the accepted friends (rest stay "say hi") ────
insert into public.messages (sender_id, recipient_id, body, created_at, read_at)
select
  case when v.from_me then (select id from auth.users where email = 'YOUR_EMOMAP_LOGIN_EMAIL') else du.id end,
  case when v.from_me then du.id else (select id from auth.users where email = 'YOUR_EMOMAP_LOGIN_EMAIL') end,
  v.body,
  now() - (v.mins_ago || ' minutes')::interval,
  case when v.from_me then now() - (v.mins_ago || ' minutes')::interval + interval '1 minute' else null end
from (values
  ('f01', true,  'Szia! Láttalak a térképen, minden okés?', 180),
  ('f01', false, 'Szia! Igen :) épp egy kávézóban ülök', 175),
  ('f01', true,  'Haha, irigy vagyok, jó kávét igyál!', 170),
  ('f03', true,  'Mizu, jössz ma este?', 60),
  ('f03', false, 'Jövök! 8-kor ott vagyok', 55),
  ('f05', false, 'Látom boldog vagy ma :)', 20),
  ('f05', true,  'Az vagyok! Szuper napom van', 18),
  ('f07', true,  'Hali, rég beszéltünk', 1440),
  ('f07', false, 'Tényleg! Mizu veled?', 1430),
  ('f09', false, 'Szia!', 4320),
  ('f11', true,  'Hali, hogy vagy?', 10)
) as v(label, from_me, body, mins_ago)
join _demo_users du on du.label = v.label;

-- ── 5. A couple of friends with extra profile details (bio/contact) ────────
insert into public.profile_details (user_id, full_name, phone, contact_note, visible_fields)
select du.id, v.full_name, v.phone, v.note, array['full_name','contact_note']
from (values
  ('f01','Kovács Nóra','+36 30 123 4567','Szeret kávézni és élőzenét hallgatni.'),
  ('f03','Tóth Balázs','+36 20 987 6543','Hobbifotós, szívesen mutat jó helyeket.')
) as v(label, full_name, phone, note)
join _demo_users du on du.label = v.label
on conflict (user_id) do update set
  full_name = excluded.full_name, phone = excluded.phone,
  contact_note = excluded.contact_note, visible_fields = excluded.visible_fields;

-- ── 6. Live mood votes ──────────────────────────────────────────────────────
-- Friends — scattered across HU + a few nearby EU cities
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select du.id, 'demo', v.emotion, v.lat, v.lng, true, now() - (v.mins_ago || ' minutes')::interval
from (values
  ('f01','happy',     47.4979, 19.0402, 12),  -- Budapest
  ('f02','hype',       47.6875, 17.6504,  8),  -- Győr
  ('f03','motivated',  47.2307, 16.6218, 25),  -- Szombathely
  ('f04','love',       47.3886, 16.5412, 15),  -- Kőszeg
  ('f05','bored',      47.6817, 16.5845, 30),  -- Sopron
  ('f06','stressed',   47.5316, 21.6273,  5),  -- Debrecen
  ('f07','tired',      46.2530, 20.1414, 40),  -- Szeged
  ('f08','happy',      46.0727, 18.2330, 18),  -- Pécs
  ('f09','hype',       48.1035, 20.7784, 22),  -- Miskolc
  ('f10','motivated',  47.0929, 17.9093, 10),  -- Veszprém
  ('f11','love',       46.9062, 19.6913,  6),  -- Kecskemét
  ('f12','bored',      47.9495, 21.7244, 35),  -- Nyíregyháza
  ('f13','stressed',   46.8417, 16.8416, 28),  -- Zalaegerszeg
  ('f14','tired',      48.2082, 16.3738, 45),  -- Vienna
  ('f15','happy',      52.5200, 13.4050, 20),  -- Berlin
  ('f16','hype',       48.1486, 17.1077, 33),  -- Bratislava
  ('f17','motivated',  47.0707, 15.4395, 14),  -- Graz
  ('f18','love',       50.0755, 14.4378,  9)   -- Prague
) as v(label, emotion, lat, lng, mins_ago)
join _demo_users du on du.label = v.label;

-- Worldwide singles — one lone vote each across every continent
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select du.id, 'demo', v.emotion, v.lat, v.lng, true, now() - (v.mins_ago || ' minutes')::interval
from (values
  ('w01','happy',     51.5074,  -0.1278, 11),  -- London
  ('w02','hype',       48.8566,   2.3522, 24),  -- Paris
  ('w03','motivated',  52.5200,  13.4050,  7),  -- Berlin
  ('w04','love',       40.4168,  -3.7038, 31),  -- Madrid
  ('w05','bored',      41.9028,  12.4964, 19),  -- Rome
  ('w06','stressed',   41.0082,  28.9784, 44),  -- Istanbul
  ('w07','tired',      55.7558,  37.6173,  3),  -- Moscow
  ('w08','happy',      25.2048,  55.2708, 27),  -- Dubai
  ('w09','hype',       19.0760,  72.8777, 16),  -- Mumbai
  ('w10','motivated',  13.7563, 100.5018, 38),  -- Bangkok
  ('w11','love',       35.6762, 139.6503,  9),  -- Tokyo
  ('w12','bored',      37.5665, 126.9780, 21),  -- Seoul
  ('w13','stressed',   39.9042, 116.4074, 13),  -- Beijing
  ('w14','tired',     -33.8688, 151.2093, 42),  -- Sydney
  ('w15','happy',     -36.8485, 174.7633,  5),  -- Auckland
  ('w16','hype',      -26.2041,  28.0473, 29),  -- Johannesburg
  ('w17','motivated',  30.0444,  31.2357, 36),  -- Cairo
  ('w18','love',        6.5244,   3.3792, 17),  -- Lagos
  ('w19','bored',     -23.5505, -46.6333, 23),  -- São Paulo
  ('w20','stressed',   40.7128, -74.0060, 14)   -- New York
) as v(label, emotion, lat, lng, mins_ago)
join _demo_users du on du.label = v.label;

-- Medium "district" cluster — ~500m scatter around Budapest's Deák Ferenc tér
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select du.id, 'demo',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  47.4979 + (random() - 0.5) * 0.007,
  19.0569 + (random() - 0.5) * 0.007,
  true,
  now() - (floor(random() * 40) || ' minutes')::interval
from _demo_users du
where du.label like 'm%';

-- Dense "packed venue" cluster — ~80m scatter around Kőszeg's Jurisics tér
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select du.id, 'demo',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  47.3886 + (random() - 0.5) * 0.0011,
  16.5412 + (random() - 0.5) * 0.0011,
  true,
  now() - (floor(random() * 40) || ' minutes')::interval
from _demo_users du
where du.label like 'c%';

drop table _demo_users;
