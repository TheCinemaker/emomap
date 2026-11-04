-- Enable Supabase Realtime for the tables that need live push updates:
-- ReelsViewer.jsx subscribes to `reels` (new story appears without a
-- manual refresh), useVenues.js subscribes to `venues` (a newly claimed
-- venue appears on other people's maps live). Without this, both features
-- still WORK (they fetch once on mount/bounds-change via normal REST
-- queries) — they just won't live-update until the next fetch/remount.
-- Idempotent: skips a table that's already in the publication instead of
-- erroring on re-run.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reels'
  ) then
    alter publication supabase_realtime add table public.reels;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'venues'
  ) then
    alter publication supabase_realtime add table public.venues;
  end if;
end $$;
