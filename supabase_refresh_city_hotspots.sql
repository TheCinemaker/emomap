-- Refreshes every demo/load-test account's "active now" mood vote,
-- concentrated on 30 real major world cities (jittered ~±8km around each
-- city center) instead of the previous mix (40% city-clustered, 60%
-- fully random worldwide, incl. oceans/deserts) — and with a brand new
-- timestamp, since the old batch aged out of the 1h live window.
--
-- Covers BOTH pools (is_demo — the curated friends/world seed — and
-- is_loadtest — the 50k brutal-test pool), so this is the single script
-- to re-run whenever you want the map to look "alive" again.
--
-- Idempotent: safe to run multiple times (each run just replaces the
-- previous active vote with a fresh one at a new random city).

update public.emotions
set is_active = false
where is_active = true
  and user_id in (
    select id from auth.users
    where raw_user_meta_data->>'is_demo' = 'true'
       or raw_user_meta_data->>'is_loadtest' = 'true'
  );

insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  u.id,
  'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  c.lat + (random() - 0.5) * 0.15,
  c.lng + (random() - 0.5) * 0.15,
  true,
  now() - (floor(random() * 50) || ' minutes')::interval
from auth.users u
join lateral (
  select * from (values
    (35.6762, 139.6503),   -- Tokyo
    (40.7128, -74.0060),   -- New York
    (51.5074, -0.1278),    -- London
    (48.8566, 2.3522),     -- Paris
    (19.0760, 72.8777),    -- Mumbai
    (-23.5505, -46.6333),  -- São Paulo
    (52.5200, 13.4050),    -- Berlin
    (47.4979, 19.0402),    -- Budapest
    (-33.8688, 151.2093),  -- Sydney
    (-26.2041, 28.0473),   -- Johannesburg
    (30.0444, 31.2357),    -- Cairo
    (55.7558, 37.6173),    -- Moscow
    (39.9042, 116.4074),   -- Beijing
    (37.5665, 126.9780),   -- Seoul
    (19.4326, -99.1332),   -- Mexico City
    (43.6532, -79.3832),   -- Toronto
    (25.2048, 55.2708),    -- Dubai
    (1.3521, 103.8198),    -- Singapore
    (13.7563, 100.5018),   -- Bangkok
    (41.0082, 28.9784),    -- Istanbul
    (6.5244, 3.3792),      -- Lagos
    (-34.6037, -58.3816),  -- Buenos Aires
    (41.9028, 12.4964),    -- Rome
    (40.4168, -3.7038),    -- Madrid
    (34.0522, -118.2437),  -- Los Angeles
    (41.8781, -87.6298),   -- Chicago
    (31.2304, 121.4737),   -- Shanghai
    (-6.2088, 106.8456),   -- Jakarta
    (35.6895, 139.6917),   -- Yokohama
    (45.4642, 9.1900)      -- Milan
  ) as cities(lat, lng)
  order by random()
  limit 1
) c on true
where u.raw_user_meta_data->>'is_demo' = 'true'
   or u.raw_user_meta_data->>'is_loadtest' = 'true';
