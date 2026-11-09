-- Auto-refreshes the demo/load-test "active now" mood votes every 40
-- minutes, forever — so the map never looks empty to a new visitor (e.g.
-- "ha holnap valaki megnyitja, üres lesz a térkép") WITHOUT touching the
-- real 1h mood-grid window, which was an explicit, deliberate, repeated
-- product decision this session ("a térkép a MOST-ot mutassa, ne egy
-- elmosódott egészet") — widening that window to weeks would make real
-- users' moods look stale-but-live too, the exact bug already reverted
-- once already today when Gemini's seed script did something similar.
--
-- Requires the pg_cron extension. If "create extension pg_cron" errors
-- (not available on your plan/project), this whole approach won't work —
-- tell me and we'll fall back to a Cloudflare Cron Trigger calling a
-- Worker instead.
--
-- Idempotent: safe to run multiple times (re-scheduling the same job name
-- replaces the previous schedule).

create extension if not exists pg_cron;

-- Same logic as supabase_refresh_city_hotspots.sql (v4), wrapped as a
-- callable function so pg_cron can run it directly.
create or replace function public.refresh_demo_hotspots()
returns void
language sql
as $$
  -- DELETE, not deactivate: 2026-11-09 fix (see supabase_fix_slow_refresh.sql)
  -- — soft-deactivating left ~50k dead rows behind on every single 40-minute
  -- cycle forever, which is exactly what made both the table and this very
  -- function slower over time until it started timing out.
  with deleted as (
    delete from public.emotions
    where is_active = true
      and user_id in (
        select id from auth.users
        where raw_user_meta_data->>'is_demo' = 'true'
           or raw_user_meta_data->>'is_loadtest' = 'true'
      )
    returning 1
  ),
  picks as (
    select
      u.id,
      (1 + floor(random() * 112)::int) as city_idx
    from auth.users u
    where u.raw_user_meta_data->>'is_demo' = 'true'
       or u.raw_user_meta_data->>'is_loadtest' = 'true'
  ),
  cities(arr) as (
    values (array[
      '35.6762,139.6503', '40.7128,-74.0060', '51.5074,-0.1278', '48.8566,2.3522',
      '19.0760,72.8777', '-23.5505,-46.6333', '52.5200,13.4050', '47.4979,19.0402',
      '-33.8688,151.2093', '-26.2041,28.0473', '30.0444,31.2357', '55.7558,37.6173',
      '39.9042,116.4074', '37.5665,126.9780', '19.4326,-99.1332', '43.6532,-79.3832',
      '25.2048,55.2708', '1.3521,103.8198', '13.7563,100.5018', '41.0082,28.9784',
      '6.5244,3.3792', '-34.6037,-58.3816', '41.9028,12.4964', '40.4168,-3.7038',
      '34.0522,-118.2437', '41.8781,-87.6298', '31.2304,121.4737', '-6.2088,106.8456',
      '35.6895,139.6917', '45.4642,9.1900',
      '22.3193,114.1694', '25.0330,121.5654', '14.5995,120.9842', '10.8231,106.6297',
      '21.0285,105.8542', '3.1390,101.6869', '28.7041,77.1025', '12.9716,77.5946',
      '24.8607,67.0011', '31.5497,74.3436', '23.8103,90.4125', '35.6892,51.3890',
      '24.7136,46.6753', '33.3152,44.3661', '31.7683,35.2137', '31.9454,35.9284',
      '-1.2921,36.8219', '9.0300,38.7400', '33.5731,-7.5898', '5.6037,-0.1870',
      '-4.4419,15.2663', '36.7538,3.0588', '36.8065,10.1815', '37.9838,23.7275',
      '48.2082,16.3738', '52.2297,21.0122', '50.0755,14.4378', '52.3676,4.9041',
      '50.8503,4.3517', '55.6761,12.5683', '59.3293,18.0686', '59.9139,10.7522',
      '60.1699,24.9384', '53.3498,-6.2603', '38.7223,-9.1393', '41.3851,2.1734',
      '47.3769,8.5417', '49.2827,-123.1207', '45.5017,-73.5673', '42.3601,-71.0589',
      '29.7604,-95.3698', '25.7617,-80.1918', '37.7749,-122.4194', '47.6062,-122.3321',
      '39.7392,-104.9903', '33.7490,-84.3880', '38.9072,-77.0369', '39.9526,-75.1652',
      '32.7767,-96.7970', '33.4484,-112.0740', '-22.9068,-43.1729', '4.7110,-74.0721',
      '-12.0464,-77.0428', '-33.4489,-70.6693', '10.4806,-66.9036', '23.1136,-82.3666',
      '-36.8485,174.7633', '-37.8136,144.9631', '-27.4698,153.0251', '-31.9505,115.8605',
      '-41.2865,174.7762', '23.1291,113.2644', '22.5431,114.0579', '30.5728,104.0668',
      '34.6937,135.5023', '35.1815,136.9066', '35.0116,135.7681', '35.1796,129.0756',
      '13.0827,80.2707', '22.5726,88.3639', '17.3850,78.4867', '18.5204,73.8567',
      '6.9271,79.8612', '27.7172,85.3240'
    ])
  )
  insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active, inserted_at)
  select
    p.id,
    'global',
    case
      when random() < 0.75
        then (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + (p.city_idx % 7)]
      else (array['happy','hype','motivated','love','bored','stressed','tired'])[1 + floor(random() * 7)::int]
    end,
    split_part(c.arr[p.city_idx], ',', 1)::numeric + (random() - 0.5) * 0.15,
    split_part(c.arr[p.city_idx], ',', 2)::numeric + (random() - 0.5) * 0.15,
    true,
    now() - (floor(random() * 30) || ' minutes')::interval
  from picks p, cities c;
$$;

-- Run it every 40 minutes, forever — comfortably inside the 1h window
-- every single time, so the demo map is always "currently active".
select cron.schedule(
  'refresh-demo-hotspots',
  '*/40 * * * *',
  $$select public.refresh_demo_hotspots();$$
);

-- Run it once right now too, so you don't have to wait 40 minutes to see it.
select public.refresh_demo_hotspots();
