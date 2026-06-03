-- Run this on the new Supabase project (Studio → SQL Editor → New query)
-- Idempotent: safe to run multiple times.

-- 1. Server-side rate limit for emotions (1 vote per 2 min per user)
create or replace function public.check_emotion_rate_limit()
returns boolean as $$
  select not exists (
    select 1 from public.emotions
    where user_id = auth.uid()
      and inserted_at > now() - interval '2 minutes'
  );
$$ language sql security definer stable;

drop policy if exists "Authenticated users can insert emotions." on public.emotions;
drop policy if exists "Authenticated users can insert their own emotions (rate-limited)." on public.emotions;
create policy "Authenticated users can insert their own emotions (rate-limited)."
  on public.emotions for insert with check (
    auth.role() = 'authenticated'
    and auth.uid() = user_id
    and public.check_emotion_rate_limit()
  );

-- 2. Atomic match join (race-condition-free)
drop function if exists public.try_join_match(boolean);
create function public.try_join_match(p_anonymous boolean)
returns table (id uuid, user1_id uuid, user2_id uuid, status text, created_existing boolean)
language plpgsql security definer
as $$
declare
  v_match public.matches%rowtype;
  v_target_id uuid;
begin
  -- Atomically claim a waiting row (or none)
  select inner_m.id into v_target_id
  from public.matches as inner_m
  where inner_m.status = 'searching'
    and inner_m.user1_id <> auth.uid()
  order by inner_m.created_at asc
  limit 1
  for update skip locked;

  if v_target_id is not null then
    update public.matches as outer_m
    set status = 'matched',
        user2_id = auth.uid(),
        user2_anonymous = p_anonymous
    where outer_m.id = v_target_id
    returning outer_m.* into v_match;

    return query select v_match.id, v_match.user1_id, v_match.user2_id, v_match.status, true;
    return;
  end if;

  -- No one waiting → create a new match
  insert into public.matches (user1_id, user1_anonymous)
  values (auth.uid(), p_anonymous)
  returning * into v_match;

  return query select v_match.id, v_match.user1_id, v_match.user2_id, v_match.status, false;
end;
$$;

grant execute on function public.try_join_match(boolean) to authenticated;

-- 3. Tighten reels visibility (only non-expired)
drop policy if exists "Reels are viewable by everyone." on public.reels;
drop policy if exists "Reels (non-expired) are viewable by everyone." on public.reels;
create policy "Reels (non-expired) are viewable by everyone."
  on public.reels for select using ( expires_at > now() );

drop policy if exists "Users can delete their own reels." on public.reels;
create policy "Users can delete their own reels."
  on public.reels for delete using ( auth.uid() = user_id );

-- 3b. Case-insensitive uniqueness for usernames (so "Xyz" and "xyz" can't both exist)
create unique index if not exists profiles_username_ci_idx
  on public.profiles (lower(username));

-- 3c. Look up email by username (so users can sign in with nickname instead of email).
-- security definer is needed because auth.users is not readable from the client.
create or replace function public.email_for_username(p_username text)
returns text
language sql security definer stable
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 4. Performance indexes
create index if not exists emotions_inserted_at_idx on public.emotions (inserted_at desc);
create index if not exists emotions_lat_lng_idx on public.emotions (lat, lng);
create index if not exists emotions_user_inserted_idx on public.emotions (user_id, inserted_at desc);
create index if not exists emotions_session_inserted_idx on public.emotions (session_id, inserted_at desc);
create index if not exists matches_searching_idx on public.matches (created_at) where status = 'searching';
create index if not exists reels_expires_idx on public.reels (expires_at);

-- 5. Storage buckets + policies (reels, matches)
insert into storage.buckets (id, name, public) values ('reels', 'reels', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('matches', 'matches', true)
  on conflict (id) do nothing;

drop policy if exists "Anyone can view reels" on storage.objects;
create policy "Anyone can view reels" on storage.objects
  for select using ( bucket_id = 'reels' );

drop policy if exists "Authenticated users can upload reels" on storage.objects;
create policy "Authenticated users can upload reels" on storage.objects
  for insert with check ( bucket_id = 'reels' and auth.role() = 'authenticated' );

drop policy if exists "Anyone can view match photos" on storage.objects;
create policy "Anyone can view match photos" on storage.objects
  for select using ( bucket_id = 'matches' );

drop policy if exists "Authenticated users can upload match photos" on storage.objects;
create policy "Authenticated users can upload match photos" on storage.objects
  for insert with check ( bucket_id = 'matches' and auth.role() = 'authenticated' );
