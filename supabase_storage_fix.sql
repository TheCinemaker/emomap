-- Fix Storage bucket policies for reels and matches
-- Run this in the Supabase SQL Editor for project sfbuabdzkpzwpffuuwva

-- 1. Ensure buckets exist and are public
insert into storage.buckets (id, name, public)
  values ('reels', 'reels', true)
  on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
  values ('matches', 'matches', true)
  on conflict (id) do update set public = true;

-- 2. Drop old policies (in case they exist from previous run)
drop policy if exists "Anyone can view reels" on storage.objects;
drop policy if exists "Authenticated users can upload reels" on storage.objects;
drop policy if exists "Anyone can view match photos" on storage.objects;
drop policy if exists "Authenticated users can upload match photos" on storage.objects;
-- Also drop any delete/update policies
drop policy if exists "Authenticated users can delete reels" on storage.objects;
drop policy if exists "Authenticated users can delete match photos" on storage.objects;

-- 3. Recreate storage policies properly

-- REELS bucket
create policy "reels_select" on storage.objects
  for select using (bucket_id = 'reels');

create policy "reels_insert" on storage.objects
  for insert with check (
    bucket_id = 'reels'
    and auth.role() = 'authenticated'
  );

create policy "reels_delete" on storage.objects
  for delete using (
    bucket_id = 'reels'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- MATCHES bucket
create policy "matches_select" on storage.objects
  for select using (bucket_id = 'matches');

create policy "matches_insert" on storage.objects
  for insert with check (
    bucket_id = 'matches'
    and auth.role() = 'authenticated'
  );

create policy "matches_delete" on storage.objects
  for delete using (
    bucket_id = 'matches'
    and auth.role() = 'authenticated'
  );
