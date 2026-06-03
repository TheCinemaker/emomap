-- Fix: Add direct FK from reels.user_id to profiles.id
-- so PostgREST can do the join in the API query

-- Drop old FK that points to auth.users
alter table public.reels drop constraint if exists reels_user_id_fkey;

-- Add new FK pointing to public.profiles instead
alter table public.reels
  add constraint reels_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- Same fix for match_photos
alter table public.match_photos drop constraint if exists match_photos_sender_id_fkey;
alter table public.match_photos
  add constraint match_photos_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete cascade;
