-- ============================================================================
-- MEGA GLOBAL SEED: THOUSANDS OF EMOTION PINS (TOKYO, NYC, LA, EUROPE, ASIA)
-- + PERMANENT RICH PULSES FEED
-- All emotion points use session_id = 'global', is_active = true
-- Pulses use permanent active expiry dates and high-res verified image URLs
-- ============================================================================

DO $$
DECLARE
  v_owner_id UUID;
BEGIN
  -- Get existing owner account
  SELECT id INTO v_owner_id FROM auth.users WHERE email = 'koszegfotok@gmail.com' LIMIT 1;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM auth.users WHERE email = 'avar.szilveszter@gmail.com' LIMIT 1;
  END IF;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM auth.users LIMIT 1;
  END IF;

  -- 1a. Ensure Creator Accounts exist in auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  )
  VALUES
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'demo-yuki@emomap.local', crypt('demo-yuki', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'yuki_shibuya', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'demo-kenji@emomap.local', crypt('demo-kenji', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'kenji_tokyo', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'demo-chloe@emomap.local', crypt('demo-chloe', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'chloe_nyc', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'demo-marcus@emomap.local', crypt('demo-marcus', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'marcus_brooklyn', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'demo-maya@emomap.local', crypt('demo-maya', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'maya_la', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'demo-dani@emomap.local', crypt('demo-dani', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'dani_bp', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'demo-sophie@emomap.local', crypt('demo-sophie', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'sophie_paris', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000008', 'authenticated', 'authenticated', 'demo-liam@emomap.local', crypt('demo-liam', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'liam_london', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'a0000001-0000-0000-0000-000000000009', 'authenticated', 'authenticated', 'demo-hana@emomap.local', crypt('demo-hana', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'hana_kyoto', 'is_demo', true), now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000010', 'a0000001-0000-0000-0000-000000000010', 'authenticated', 'authenticated', 'demo-leo@emomap.local', crypt('demo-leo', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('username', 'leo_sf', 'is_demo', true), now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  -- 1b. Insert/Ensure Creator Profiles
  INSERT INTO public.profiles (id, username, avatar_url)
  VALUES
    ('a0000001-0000-0000-0000-000000000001', 'yuki_shibuya', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000002', 'kenji_tokyo', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000003', 'chloe_nyc', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000004', 'marcus_brooklyn', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000005', 'maya_la', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000006', 'dani_bp', 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000007', 'sophie_paris', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000008', 'liam_london', 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000009', 'hana_kyoto', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80'),
    ('a0000001-0000-0000-0000-000000000010', 'leo_sf', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80')
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url;

  -- 2. Clear old demo reels and insert 10 stunning, rich Pulses
  DELETE FROM public.reels WHERE user_id IN (
    'a0000001-0000-0000-0000-000000000001',
    'a0000001-0000-0000-0000-000000000002',
    'a0000001-0000-0000-0000-000000000003',
    'a0000001-0000-0000-0000-000000000004',
    'a0000001-0000-0000-0000-000000000005',
    'a0000001-0000-0000-0000-000000000006',
    'a0000001-0000-0000-0000-000000000007',
    'a0000001-0000-0000-0000-000000000008',
    'a0000001-0000-0000-0000-000000000009',
    'a0000001-0000-0000-0000-000000000010'
  );

  -- Pulse 1: Shibuya Crossing Night (Tokyo)
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000001',
    'a0000001-0000-0000-0000-000000000001',
    'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1080&q=85',
    'Shibuya is absolutely buzzing tonight! The energy here is insane.',
    'hype',
    now() + interval '10 years',
    now() - interval '18 minutes'
  );

  -- Pulse 2: NYC Rooftop Sunset (New York)
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000002',
    'a0000001-0000-0000-0000-000000000003',
    'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1080&q=85',
    'Golden hour over Manhattan. Best city in the world.',
    'love',
    now() + interval '10 years',
    now() - interval '34 minutes'
  );

  -- Pulse 3: Tokyo Ramen Shop (Shinjuku)
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000003',
    'a0000001-0000-0000-0000-000000000002',
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=1080&q=85',
    'Midnight tonkotsu ramen in Shinjuku after a 12h sprint.',
    'motivated',
    now() + interval '10 years',
    now() - interval '52 minutes'
  );

  -- Pulse 4: Venice Beach Sunset (Los Angeles)
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000004',
    'a0000001-0000-0000-0000-000000000005',
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1080&q=85',
    'Friday breeze at Venice Beach. Pure peace.',
    'happy',
    now() + interval '10 years',
    now() - interval '1 hour 12 minutes'
  );

  -- Pulse 5: Budapest Gozsdu Party
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000005',
    'a0000001-0000-0000-0000-000000000006',
    'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1080&q=85',
    'Pentek este a Gozsduban! Megy az orulet.',
    'hype',
    now() + interval '10 years',
    now() - interval '1 hour 45 minutes'
  );

  -- Pulse 6: Paris Cafe morning
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000006',
    'a0000001-0000-0000-0000-000000000007',
    'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1080&q=85',
    'Croissant & cafe in Montmartre. J''adore cette ville.',
    'love',
    now() + interval '10 years',
    now() - interval '2 hours 20 minutes'
  );

  -- Pulse 7: Kyoto Bamboo Grove
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000007',
    'a0000001-0000-0000-0000-000000000009',
    'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1080&q=85',
    'Early morning walk in Arashiyama. Silence and green everywhere.',
    'happy',
    now() + interval '10 years',
    now() - interval '3 hours 10 minutes'
  );

  -- Pulse 8: Brooklyn Bridge View
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000008',
    'a0000001-0000-0000-0000-000000000004',
    'https://images.unsplash.com/photo-1496868834840-5f4c98840aaa?auto=format&fit=crop&w=1080&q=85',
    'Crossing the bridge at dusk. Brooklyn never sleeps.',
    'motivated',
    now() + interval '10 years',
    now() - interval '3 hours 40 minutes'
  );

  -- Pulse 9: San Francisco Golden Gate
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000009',
    'a0000001-0000-0000-0000-000000000010',
    'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=1080&q=85',
    'Clear skies over the bay today! Ready to build something huge.',
    'hype',
    now() + interval '10 years',
    now() - interval '4 hours 15 minutes'
  );

  -- Pulse 10: London Night Lights
  INSERT INTO public.reels (id, user_id, image_url, caption, emotion, expires_at, created_at)
  VALUES (
    'b0000001-0000-0000-0000-000000000010',
    'a0000001-0000-0000-0000-000000000008',
    'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1080&q=85',
    'London vibes. The city is glowing tonight.',
    'love',
    now() + interval '10 years',
    now() - interval '5 hours'
  );

  -- Likes
  INSERT INTO public.reel_likes (reel_id, user_id)
  VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002'),
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000003'),
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000005'),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000001'),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000004'),
    ('b0000001-0000-0000-0000-000000000004', 'a0000001-0000-0000-0000-000000000010'),
    ('b0000001-0000-0000-0000-000000000005', 'a0000001-0000-0000-0000-000000000001'),
    ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000001'),
    ('b0000001-0000-0000-0000-000000000009', 'a0000001-0000-0000-0000-000000000005')
  ON CONFLICT DO NOTHING;

  -- Comments
  INSERT INTO public.reel_comments (reel_id, user_id, body, created_at)
  VALUES
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000003', 'OMG I need to visit Tokyo so badly!!', now() - interval '14 minutes'),
    ('b0000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000002', 'Sugoi!! See you in Shinjuku later!', now() - interval '8 minutes'),
    ('b0000001-0000-0000-0000-000000000002', 'a0000001-0000-0000-0000-000000000005', 'Which rooftop is this?? Looks unreal!', now() - interval '25 minutes'),
    ('b0000001-0000-0000-0000-000000000007', 'a0000001-0000-0000-0000-000000000002', 'Arashiyama at dawn is magic.', now() - interval '2 hours')
  ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- 3. GLOBAL EMOTION HOTSPOTS (session_id = 'global', is_active = true)
-- 4000+ points across Japan, USA, Europe and major worldwide cities!
-- ============================================================================

-- Clean old seed points
DELETE FROM public.emotions WHERE session_id = 'global' AND (
  user_id IN (
    'a0000001-0000-0000-0000-000000000001',
    'a0000001-0000-0000-0000-000000000002',
    'a0000001-0000-0000-0000-000000000003',
    'a0000001-0000-0000-0000-000000000004',
    'a0000001-0000-0000-0000-000000000005',
    'a0000001-0000-0000-0000-000000000006',
    'a0000001-0000-0000-0000-000000000007',
    'a0000001-0000-0000-0000-000000000008',
    'a0000001-0000-0000-0000-000000000009',
    'a0000001-0000-0000-0000-000000000010'
  )
  OR user_id IS NULL
);

-- ----------------------------------------------------------------------------
-- JAPAN HOTSPOTS (~1,500 points)
-- ----------------------------------------------------------------------------

-- Tokyo: Shibuya Crossing & Hachiko (350 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','hype','love','happy','motivated'])[1 + floor(random() * 5)::int],
  35.6595 + (random() - 0.5) * 0.008,
  139.7004 + (random() - 0.5) * 0.008,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 350);

-- Tokyo: Shinjuku Kabukicho & Omoide Yokocho (300 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','motivated','stressed','hype','happy'])[1 + floor(random() * 5)::int],
  35.6938 + (random() - 0.5) * 0.012,
  139.7034 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 300);

-- Tokyo: Akihabara Electric Town (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','happy','hype','motivated'])[1 + floor(random() * 4)::int],
  35.6983 + (random() - 0.5) * 0.009,
  139.7731 + (random() - 0.5) * 0.009,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- Tokyo: Roppongi Nightlife & Hills (180 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','love','happy','motivated'])[1 + floor(random() * 4)::int],
  35.6628 + (random() - 0.5) * 0.010,
  139.7314 + (random() - 0.5) * 0.010,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 180);

-- Tokyo: Harajuku & Omotesando (180 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','hype','love','motivated'])[1 + floor(random() * 4)::int],
  35.6702 + (random() - 0.5) * 0.009,
  139.7027 + (random() - 0.5) * 0.009,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 180);

-- Osaka: Dotonbori & Shinsaibashi (220 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','happy','motivated','love'])[1 + floor(random() * 4)::int],
  34.6687 + (random() - 0.5) * 0.010,
  135.5013 + (random() - 0.5) * 0.010,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 220);

-- Kyoto: Gion & Kiyomizudera (150 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','happy','tired','motivated'])[1 + floor(random() * 4)::int],
  34.9949 + (random() - 0.5) * 0.012,
  135.7850 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 150);

-- ----------------------------------------------------------------------------
-- USA HOTSPOTS (~1,600 points)
-- ----------------------------------------------------------------------------

-- New York: Times Square & Midtown (350 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','hype','stressed','happy','motivated'])[1 + floor(random() * 5)::int],
  40.7580 + (random() - 0.5) * 0.012,
  -73.9855 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 350);

-- New York: Central Park (220 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','motivated','tired'])[1 + floor(random() * 4)::int],
  40.7829 + (random() - 0.5) * 0.025,
  -73.9654 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 220);

-- New York: SoHo & Greenwich Village (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','hype','happy','motivated'])[1 + floor(random() * 4)::int],
  40.7233 + (random() - 0.5) * 0.010,
  -74.0030 + (random() - 0.5) * 0.010,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- New York: Williamsburg & DUMBO, Brooklyn (250 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['motivated','hype','love','happy'])[1 + floor(random() * 4)::int],
  40.7178 + (random() - 0.5) * 0.015,
  -73.9578 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 250);

-- Los Angeles: Venice Beach & Boardwalk (250 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','hype','tired'])[1 + floor(random() * 4)::int],
  33.9850 + (random() - 0.5) * 0.020,
  -118.4695 + (random() - 0.5) * 0.020,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 250);

-- Los Angeles: Santa Monica Pier & Promenade (180 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','hype','motivated'])[1 + floor(random() * 4)::int],
  34.0100 + (random() - 0.5) * 0.012,
  -118.4960 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 180);

-- Los Angeles: Hollywood Blvd & Walk of Fame (180 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','motivated','love','stressed'])[1 + floor(random() * 4)::int],
  34.1016 + (random() - 0.5) * 0.015,
  -118.3268 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 180);

-- San Francisco: SOMA & Mission District (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['motivated','hype','stressed','happy'])[1 + floor(random() * 4)::int],
  37.7749 + (random() - 0.5) * 0.020,
  -122.4194 + (random() - 0.5) * 0.020,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- Miami: South Beach & Ocean Drive (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','love','happy','motivated'])[1 + floor(random() * 4)::int],
  25.7825 + (random() - 0.5) * 0.015,
  -80.1340 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- ----------------------------------------------------------------------------
-- EUROPE & HUNGARY HOTSPOTS (~1,200 points)
-- ----------------------------------------------------------------------------

-- Budapest: Belváros, Deák tér, Gozsdu Udvar (250 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','hype','happy','love','motivated'])[1 + floor(random() * 5)::int],
  47.4980 + (random() - 0.5) * 0.010,
  19.0550 + (random() - 0.5) * 0.010,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 250);

-- Budapest: Buda Castle & Gellérthegy (120 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','happy','tired','motivated'])[1 + floor(random() * 4)::int],
  47.4962 + (random() - 0.5) * 0.010,
  19.0396 + (random() - 0.5) * 0.010,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 120);

-- Budapest: BME & Egyetemváros (120 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['motivated','stressed','tired','hype'])[1 + floor(random() * 4)::int],
  47.4815 + (random() - 0.5) * 0.008,
  19.0556 + (random() - 0.5) * 0.008,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 120);

-- Kőszeg: Fő tér & Jurisics Vár (80 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','hype','motivated'])[1 + floor(random() * 4)::int],
  47.3886 + (random() - 0.5) * 0.006,
  16.5412 + (random() - 0.5) * 0.006,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 80);

-- Szombathely: Fő tér & Csónakázótó (90 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','happy','love','motivated'])[1 + floor(random() * 4)::int],
  47.2307 + (random() - 0.5) * 0.008,
  16.6218 + (random() - 0.5) * 0.008,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 90);

-- London: Soho, Covent Garden & West End (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','motivated','happy','stressed'])[1 + floor(random() * 4)::int],
  51.5136 + (random() - 0.5) * 0.015,
  -0.1365 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- Paris: Montmartre, Le Marais & Eiffel (200 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','love','happy','hype'])[1 + floor(random() * 4)::int],
  48.8566 + (random() - 0.5) * 0.018,
  2.3522 + (random() - 0.5) * 0.018,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 200);

-- Vienna: Stephansplatz & Ringstraße (120 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','motivated','tired'])[1 + floor(random() * 4)::int],
  48.2082 + (random() - 0.5) * 0.012,
  16.3738 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 120);

-- Berlin: Mitte & Kreuzberg (150 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','motivated','happy','tired'])[1 + floor(random() * 4)::int],
  52.5200 + (random() - 0.5) * 0.018,
  13.4050 + (random() - 0.5) * 0.018,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 150);

-- ----------------------------------------------------------------------------
-- WORLDWIDE EXPEDITION & CAPITALS (~300 points)
-- ----------------------------------------------------------------------------

-- Seoul: Gangnam & Hongdae (100 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['hype','motivated','happy','love'])[1 + floor(random() * 4)::int],
  37.4979 + (random() - 0.5) * 0.015,
  127.0276 + (random() - 0.5) * 0.015,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 100);

-- Singapore: Marina Bay (80 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['love','happy','hype','motivated'])[1 + floor(random() * 4)::int],
  1.2838 + (random() - 0.5) * 0.012,
  103.8591 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 80);

-- Sydney: Circular Quay & Opera House (80 points)
INSERT INTO public.emotions (session_id, emotion, lat, lng, is_active, inserted_at)
SELECT
  'global',
  (ARRAY['happy','love','hype'])[1 + floor(random() * 3)::int],
  -33.8568 + (random() - 0.5) * 0.012,
  151.2153 + (random() - 0.5) * 0.012,
  true,
  now() - (floor(random() * 720) || ' minutes')::interval
FROM generate_series(1, 80);
