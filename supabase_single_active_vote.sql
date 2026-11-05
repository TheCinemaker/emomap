-- One active (visible) vote per user + remove the k-anonymity sample floor
-- that was silently hiding sparse/solo votes from the live map.
--
-- User's explicit product call (2026-11-05), after watching their own vote
-- vanish within minutes of casting it:
--   1. A cast vote must show up immediately, for everyone — that's the
--      whole point of the app.
--   2. It stays visible for 1h.
--   3. If the same user changes their mood while still in the same spot,
--      the OLD vote disappears immediately — only ever ONE live pin per
--      user. This also caps map clutter: a user re-voting every 2 minutes
--      for an hour used to leave up to 30 stacked rows live; now it's 1.
--   4. Zoom-dependent color fusion (many people's emotions blending into
--      one bigger aura as you zoom out) was already implemented via
--      calculateCellSize/buildGridCells — the only thing actually broken
--      was get_mood_grid's k-anonymity floor (>=3 votes required in any
--      cell under ~5km), which made a single person's vote invisible to
--      EVERYONE, including themselves, after the ~3min personal-aura flash
--      expired. With one-active-vote-per-user + 10m jitter + no identity
--      ever attached to a map marker, that floor's privacy value is gone
--      (it existed to stop a handful of *repeat* votes clustering around a
--      home address from fingerprinting a resident) but its cost (a dead-
--      looking map for the very first users anywhere) was real and now
--      confirmed in practice. Dropping it. Still anonymous, still jittered,
--      just no longer artificially suppressed.
--
-- Idempotent: safe to run multiple times.

alter table public.emotions add column if not exists is_active boolean not null default true;
create index if not exists emotions_active_user_idx on public.emotions (user_id) where is_active;
create index if not exists emotions_active_window_idx on public.emotions (is_active, inserted_at);

-- Atomically replace a user's live vote: deactivate whatever they had
-- showing, insert the new one. Runs as SECURITY DEFINER so it bypasses the
-- (role-scoped) RLS insert policy entirely — which means the 2-min rate
-- limit that policy enforced has to be re-checked explicitly in here, or
-- this function would silently remove it.
create or replace function public.cast_vote(
  p_emotion text,
  p_lat numeric,
  p_lng numeric,
  p_session_id text default 'global'
)
returns public.emotions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.emotions;
begin
  if exists (
    select 1 from public.emotions
    where user_id = auth.uid() and inserted_at > now() - interval '2 minutes'
  ) then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  update public.emotions
    set is_active = false
    where user_id = auth.uid() and is_active = true;

  insert into public.emotions (user_id, session_id, emotion, lat, lng, is_active)
  values (auth.uid(), p_session_id, p_emotion, p_lat, p_lng, true)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.cast_vote(text, numeric, numeric, text) to authenticated;

-- Re-point the live map's aggregation at "currently active" votes instead
-- of a raw time window, and drop the k-anonymity floor (see comment above).
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
  limit 3000;
$$;

grant execute on function public.get_mood_grid(numeric, numeric, numeric, numeric, numeric, timestamptz) to anon, authenticated;
