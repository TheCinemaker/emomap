-- Fixes a real scaling bug the brutal load test found (2026-11-09):
-- zoomed all the way out, get_mood_grid actually timed out live
-- (Postgres error 57014, "canceling statement due to statement timeout")
-- once the dataset had tens of thousands of distinct grid cells.
--
-- Root cause: supabase_mood_grid_radius.sql computed each cell's render
-- radius via a SELF-JOIN back onto `filtered` (every point rejoined
-- against its own cell's centroid to find the farthest member) — cheap
-- at the handful of cells a normal viewport produces, but that self-join
-- (plus its sort/merge steps) gets scanned on `filtered` THREE separate
-- times per query, and its cost scales with the number of distinct
-- CELLS, not just rows. At world-zoom with 50k+ active points scattered
-- everywhere, that's tens of thousands of cells, and the query blew
-- straight through the timeout.
--
-- Fix: the exact same "how big should this blob render" question can be
-- answered without any self-join at all — a bounding-box-based radius
-- (half the diagonal of each cell's own lat/lng min/max spread) computed
-- as plain aggregate functions in the SAME group-by that already builds
-- cell_stats. For a single point (the common case — most cells have
-- exactly one voter), max-min is zero either way, so a lone vote is still
-- exactly the fixed 5m dot it was before; for a real cluster it's a very
-- slightly different (bounding-box, not true max-distance-from-centroid)
-- but functionally equivalent measure of how spread out it is.
--
-- Idempotent: safe to run multiple times.

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
    select
      gx, gy,
      avg(lat) as avg_lat,
      avg(lng) as avg_lng,
      count(*) as total,
      -- Half the bounding-box diagonal, in meters — no self-join needed.
      sqrt(
        power((max(lat) - min(lat)) * 111320, 2)
        + power((max(lng) - min(lng)) * 111320 * cos(radians(avg(lat))), 2)
      ) / 2 as radius_m
    from filtered
    group by gx, gy
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
    (cs.radius_m + 5) as radius_m
  from emotion_stats es
  join cell_stats cs on cs.gx = es.gx and cs.gy = es.gy
  order by cs.total desc
  limit 3000;
$$;

grant execute on function public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz) to anon, authenticated;
