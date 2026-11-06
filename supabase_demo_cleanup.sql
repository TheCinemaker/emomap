-- Removes every demo account created by supabase_demo_seed.sql (friends,
-- worldwide singles, and both test clusters). Run this once, right before
-- launch — cascades through profiles, profile_details, emotions,
-- friendships and messages automatically (all FK'd to auth.users with
-- ON DELETE CASCADE), so nothing needs to be cleaned up table-by-table.
delete from auth.users where raw_user_meta_data->>'is_demo' = 'true';
