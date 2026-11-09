-- Fixes the REAL cause of get_mood_grid timing out live (2026-11-09),
-- found via the exact failing request's response headers:
-- x-envoy-upstream-service-time: 8304 — the query ran for 8.3 SECONDS
-- server-side before Postgres's statement_timeout cancelled it (error
-- 57014). Yet running the exact same parameter values as literals
-- directly in the SQL editor consistently finished in under 500ms.
--
-- Root cause: get_mood_grid was a plain `language sql` function. When
-- PostgREST calls it via the REST API, the parameters arrive as bound
-- parameters (prepared-statement style), not literal text — Postgres
-- can't peek at the actual bounding-box values at plan time, so it falls
-- back to a GENERIC plan based on table-wide averages. That generic plan
-- badly misjudges how selective THIS specific box/cell-size/time-window
-- combination is (we saw an 8x row misestimate even in literal-value
-- testing earlier), and for grid-aggregation queries like this one, a
-- bad row estimate can mean a catastrophically wrong join strategy.
-- Calling it directly with literals in the SQL editor sidesteps this
-- entirely, which is exactly why every manual test looked fine while the
-- live app kept timing out on the identical values.
--
-- Fix: switch to `language plpgsql` and run the real query via EXECUTE
-- with the parameter values interpolated as actual literals (via
-- format(... %L ...)). This forces Postgres to plan fresh, with the real
-- values in hand, on every single call — regardless of how the function
-- itself was invoked (RPC, SQL editor, connection pooler, anything).
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
language plpgsql
stable
as $$
begin
  return query execute format($f$
    with filtered as (
      select
        emotion,
        lat,
        lng,
        floor(lat / %L)::int as gx,
        floor(lng / %L)::int as gy
      from public.emotions
      where is_active = true
        and inserted_at >= %L::timestamptz
        and lat between %L and %L
        and lng between %L and %L
    ),
    cell_stats as (
      select
        gx, gy,
        avg(lat) as avg_lat,
        avg(lng) as avg_lng,
        count(*) as total,
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
      es.gx || '_' || es.gy,
      cs.avg_lat,
      cs.avg_lng,
      es.emotion,
      es.cnt,
      cs.total,
      (cs.radius_m + 5)::numeric
    from emotion_stats es
    join cell_stats cs on cs.gx = es.gx and cs.gy = es.gy
    order by cs.total desc
    limit 3000
  $f$, p_cell_size, p_cell_size, p_since, p_south, p_north, p_west, p_east);
end;
$$;

grant execute on function public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz) to anon, authenticated;
