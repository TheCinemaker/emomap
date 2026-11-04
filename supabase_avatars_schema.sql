-- Avatar storage for the Profile screen. Public read (avatars are shown to
-- everyone, e.g. on Reels), but a user may only write into their own
-- folder (path prefix = their user id), checked via storage.foldername.
-- Idempotent: safe to run multiple times.

insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do update set public = true;

drop policy if exists "avatars_select" on storage.objects;
create policy "avatars_select" on storage.objects
  for select using ( bucket_id = 'avatars' );

drop policy if exists "avatars_insert" on storage.objects;
create policy "avatars_insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars_delete" on storage.objects;
create policy "avatars_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
