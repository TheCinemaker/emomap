-- Render the mood grid by actual GPS spread, not by the zoom-level
-- clustering bucket.
--
-- User's explicit product call (2026-11-06), after a single vote at zoom
-- ~9-10 rendered as a circle spanning ~15-20km across several towns:
--   "ha kizoom-olok, az aura akkor sem nőhet meg! minél jobban kizoom-olok,
--   az aura ugy megy össze! ha a legjobban belezoom-olok, maximum 5 méteres
--   lehet az aurám. ha van a 100 méteres körzetemben még 40 aura, azokat
--   összeadva mutatjuk meg a hely auráját. de mindenki 5 métereset kap,
--   tehát a 'kör szélén' állók határozzák meg az aura méretét."
--
-- i.e. every individual vote has a fixed 5m real-world halo, never bigger,
-- at any zoom. When several votes land in the same clustering bucket
-- (calculateCellSize still controls how close two votes need to be to
-- merge, zoom-dependent, unchanged), the group's rendered radius is the
-- farthest member's distance from the group's own centroid plus that same
-- 5m halo — so it grows only as large as the real data is actually spread
-- out, never because of an arbitrary zoom-tied constant.
--
-- Idempotent: safe to run multiple times.

-- CREATE OR REPLACE can't change a function's return row shape (adding the
-- new radius_m column counts as that) — Postgres requires a DROP first.
drop function if exists public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz);

create or replace function public.get_mood_grid(
  p_south numeric,
  p_north numeric,
  p_west numeric,
  p_east numeric,
  p_cell_size numeric,
  p_since timestamptz
)
returns table (
  cell_key text,
  center_lat numeric,
  center_lng numeric,
  emotion text,
  emotion_count bigint,
  cell_total bigint,
  radius_m numeric
)
language sql
stable
as $$
  with filtered as (
    select
      emotion,
      lat,
      lng,
      floor(lat / p_cell_size)::int as gx,
      floor(lng / p_cell_size)::int as gy
    from public.emotions
    where is_active = true
      and inserted_at >= p_since
      and lat between p_south and p_north
      and lng between p_west and p_east
  ),
  cell_stats as (
    select gx, gy, avg(lat) as avg_lat, avg(lng) as avg_lng, count(*) as total
    from filtered
    group by gx, gy
  ),
  spread as (
    -- Max distance (meters) from the cell's own centroid to any member —
    -- plain equirectangular approximation, plenty accurate at this scale
    -- (a few km at most) and avoids needing PostGIS for one computation.
    select
      f.gx, f.gy,
      max(
        sqrt(
          power((f.lat - cs.avg_lat) * 111320, 2)
          + power((f.lng - cs.avg_lng) * 111320 * cos(radians(cs.avg_lat)), 2)
        )
      ) as max_dist_m
    from filtered f
    join cell_stats cs on cs.gx = f.gx and cs.gy = f.gy
    group by f.gx, f.gy
  ),
  emotion_stats as (
    select gx, gy, emotion, count(*) as cnt
    from filtered
    group by gx, gy, emotion
  )
  select
    es.gx || '_' || es.gy as cell_key,
    cs.avg_lat as center_lat,
    cs.avg_lng as center_lng,
    es.emotion,
    es.cnt as emotion_count,
    cs.total as cell_total,
    (sp.max_dist_m + 5) as radius_m
  from emotion_stats es
  join cell_stats cs on cs.gx = es.gx and cs.gy = es.gy
  join spread sp on sp.gx = es.gx and sp.gy = es.gy
  order by cs.total desc
  limit 3000;
$$;

grant execute on function public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz) to anon, authenticated;
