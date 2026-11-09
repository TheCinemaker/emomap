-- v3: v1 picked the city via a nested `order by random() limit 1`
-- subquery, which Postgres hoisted into a single shared computation for
-- the whole statement instead of re-running it per row (confirmed live —
-- one cell's total exactly matched the full account count). v2 fixed the
-- hoisting but introduced a NEW bug: picking lat and lng as two SEPARATE
-- `(array[...])[1 + floor(random() * 30)::int]` expressions calls
-- random() independently for each, pairing a random city's latitude with
-- a DIFFERENT random city's longitude.
--
-- Fix: pick the city ONCE per row as a single "lat,lng" string (one
-- random() call, one array lookup — the same proven direct-array-index
-- pattern used everywhere else in this session), via a CTE column, then
-- split that SAME already-computed value for both lat and lng downstream
-- — no second random draw, so the pair can't mismatch.
--
-- Idempotent: safe to run multiple times.

update public.emotions
set is_active = false
where is_active = true
  and user_id in (
    select id from auth.users
    where raw_user_meta_data->>'is_demo' = 'true'
       or raw_user_meta_data->>'is_loadtest' = 'true'
  );

with picks as (
  select
    u.id,
    (array[
      '35.6762,139.6503', '40.7128,-74.0060', '51.5074,-0.1278', '48.8566,2.3522',
      '19.0760,72.8777', '-23.5505,-46.6333', '52.5200,13.4050', '47.4979,19.0402',
      '-33.8688,151.2093', '-26.2041,28.0473', '30.0444,31.2357', '55.7558,37.6173',
      '39.9042,116.4074', '37.5665,126.9780', '19.4326,-99.1332', '43.6532,-79.3832',
      '25.2048,55.2708', '1.3521,103.8198', '13.7563,100.5018', '41.0082,28.9784',
      '6.5244,3.3792', '-34.6037,-58.3816', '41.9028,12.4964', '40.4168,-3.7038',
      '34.0522,-118.2437', '41.8781,-87.6298', '31.2304,121.4737', '-6.2088,106.8456',
      '35.6895,139.6917', '45.4642,9.1900'
    ])[1 + floor(random() * 30)::int] as city
  from auth.users u
  where u.raw_user_meta_data->>'is_demo' = 'true'
     or u.raw_user_meta_data->>'is_loadtest' = 'true'
)
insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
select
  id,
  'global',
  (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int],
  split_part(city, ',', 1)::numeric + (random() - 0.5) * 0.15,
  split_part(city, ',', 2)::numeric + (random() - 0.5) * 0.15,
  true,
  now() - (floor(random() * 50) || ' minutes')::interval
from picks;
