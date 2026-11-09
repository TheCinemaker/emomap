-- Removes every row the load test created (50k accounts + everything
-- cascaded from them: reels, likes, comments, reposts, friendships,
-- messages, emotions, profiles) in one shot. Does NOT touch the curated
-- demo/friends pool (is_demo) or any real user data.
delete from auth.users where raw_user_meta_data->>'is_loadtest' = 'true';

-- In case step 7 of supabase_load_test.sql was skipped.
drop table if exists public._lt_pool;

-- Optional: drop the extra index too once you're done measuring (keep it
-- if you're happy with the win it gives get_mood_grid at scale).
-- drop index if exists public.emotions_grid_query_idx;
