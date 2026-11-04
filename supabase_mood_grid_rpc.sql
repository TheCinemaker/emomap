-- Server-side mood-grid aggregation.
--
-- Why this exists: the client used to SELECT raw {emotion, lat, lng} rows
-- (capped at 20,000, no ORDER BY) and bucket them into a grid in JS. That
-- breaks in two ways once real volume shows up:
--   1. With no stable ordering, which 20,000 of (say) 500,000 matching rows
--      PostgREST returns can shift between polls, so cells visibly jump/
--      flicker ("összekeveredett") as load grows — not a rendering bug,
--      a query-design bug.
--   2. The amount of data transferred and processed client-side grows with
--      the number of VOTES, not the number of map cells — so it gets
--      slower exactly when the product is succeeding (more users).
-- This function flips that: Postgres does the GROUP BY, and the client only
-- ever receives one row per (cell × emotion actually present in that cell).
-- The number of rows is bounded by geography and zoom level, not by vote
-- count — 100 voters and 1,000,000 voters in the same view return the same
-- number of cells, just with bigger counts per cell.
--
-- Idempotent: safe to run multiple times.

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
  cell_total bigint
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
    where inserted_at >= p_since
      and lat between p_south and p_north
      and lng between p_west and p_east
  ),
  cell_stats as (
    select gx, gy, avg(lat) as avg_lat, avg(lng) as avg_lng, count(*) as total
    from filtered
    group by gx, gy
    -- Same k-anonymity floor as the old client-side minSampleForCellSize:
    -- a continent-sized cell needs no suppression, a neighborhood-sized
    -- one does. Computed here so a single untrusted client can't skip it.
    having count(*) >= (
      case
        when p_cell_size * 111 >= 50 then 1
        when p_cell_size * 111 >= 5 then 2
        else 3
      end
    )
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
    cs.total as cell_total
  from emotion_stats es
  join cell_stats cs on cs.gx = es.gx and cs.gy = es.gy
  order by cs.total desc
  -- Defense in depth: the client also caps rendered cells (MAX_RENDERED_CELLS
  -- in moodGridUtils.js), but bound the payload itself too, independent of
  -- however many emotions happen to co-occur per cell.
  limit 3000;
$$;

grant execute on function public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz) to anon, authenticated;

-- The old per-cell lat/lng range scan still helps the filtered CTE above.
create index if not exists emotions_lat_lng_inserted_idx
  on public.emotions (lat, lng, inserted_at);
