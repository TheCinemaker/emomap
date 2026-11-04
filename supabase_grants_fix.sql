-- Explicit Data API grants.
-- Supabase stopped auto-granting anon/authenticated privileges on new tables
-- for projects created after 2026-10-30 — without this, every supabase-js
-- call fails with a silent "permission denied", even though RLS is correct.
-- Idempotent: safe to run multiple times.

grant usage on schema public to anon, authenticated;

-- profiles
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;

-- emotions
grant select on public.emotions to anon, authenticated;
grant insert on public.emotions to authenticated;

-- reels (public story feed)
grant select on public.reels to anon, authenticated;
grant insert, delete on public.reels to authenticated;

-- matches / match_photos (authenticated-only by RLS, no anon access needed)
grant select, insert, update on public.matches to authenticated;
grant select, insert, update on public.match_photos to authenticated;

-- service_role already bypasses RLS and has implicit full access, but keep it explicit
grant all on public.profiles, public.emotions, public.reels, public.matches, public.match_photos to service_role;
