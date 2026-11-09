-- Gemini review suggestion (2026-11-09), verified reasonable: a partial
-- index scoped to only the "live" rows (is_active = true) is smaller and
-- cheaper to scan than the existing full-table (is_active, inserted_at)
-- index, since the overwhelming majority of rows in `emotions` are
-- historical (is_active = false) and never relevant to this query at all.
--
-- Idempotent: safe to run multiple times.
create index if not exists emotions_active_grid_fast_idx
  on public.emotions (inserted_at desc, lat, lng)
  where is_active = true;
