-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE (Store usernames and user settings)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Set up Row Level Security (RLS)
alter table public.profiles enable row level security;
create policy "Public profiles are viewable by everyone." on public.profiles for select using ( true );
create policy "Users can insert their own profile." on public.profiles for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on public.profiles for update using ( auth.uid() = id );

-- Trigger for new user creation
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if exists to avoid error
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. EMOTIONS TABLE
create table if not exists public.emotions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  session_id text,
  emotion text not null,
  lat numeric,
  lng numeric,
  inserted_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.emotions enable row level security;
create policy "Emotions are viewable by everyone." on public.emotions for select using ( true );

-- Server-side rate limit: 1 vote / 2 minutes / user
create or replace function public.check_emotion_rate_limit()
returns boolean as $$
  select not exists (
    select 1 from public.emotions
    where user_id = auth.uid()
      and inserted_at > now() - interval '2 minutes'
  );
$$ language sql security definer stable;

drop policy if exists "Authenticated users can insert emotions." on public.emotions;
create policy "Authenticated users can insert their own emotions (rate-limited)."
  on public.emotions for insert with check (
    auth.role() = 'authenticated'
    and auth.uid() = user_id
    and public.check_emotion_rate_limit()
  );

-- Performance indexes
create index if not exists emotions_inserted_at_idx on public.emotions (inserted_at desc);
create index if not exists emotions_lat_lng_idx on public.emotions (lat, lng);
create index if not exists emotions_user_inserted_idx on public.emotions (user_id, inserted_at desc);
create index if not exists emotions_session_inserted_idx on public.emotions (session_id, inserted_at desc);

-- 3. REELS TABLE (24h photos)
create table if not exists public.reels (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  image_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  expires_at timestamp with time zone default (now() + interval '24 hours') not null
);

alter table public.reels enable row level security;
create policy "Reels (non-expired) are viewable by everyone." on public.reels for select using ( expires_at > now() );
create policy "Users can insert their own reels." on public.reels for insert with check ( auth.uid() = user_id );
create policy "Users can delete their own reels." on public.reels for delete using ( auth.uid() = user_id );

create index if not exists reels_expires_idx on public.reels (expires_at);

-- 4. MATCHES TABLE (For the 1v1 Random connect)
create table if not exists public.matches (
  id uuid default uuid_generate_v4() primary key,
  user1_id uuid references auth.users(id) on delete cascade not null,
  user2_id uuid references auth.users(id) on delete cascade,
  user1_anonymous boolean default true,
  user2_anonymous boolean default true,
  status text default 'searching' check (status in ('searching', 'matched', 'completed')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.matches enable row level security;
create policy "Users can view their own matches." on public.matches for select using ( auth.uid() = user1_id or auth.uid() = user2_id );
create policy "Users can create a match." on public.matches for insert with check ( auth.uid() = user1_id );
create policy "Users can update their matches." on public.matches for update using ( auth.uid() = user1_id or auth.uid() = user2_id );

create index if not exists matches_searching_idx on public.matches (created_at) where status = 'searching';

-- Atomic "find or create" match: prevents two clients from joining the same waiting match
create or replace function public.try_join_match(p_anonymous boolean)
returns table (id uuid, user1_id uuid, user2_id uuid, status text, created_existing boolean) as $$
declare
  v_match public.matches%rowtype;
begin
  update public.matches m
  set status = 'matched',
      user2_id = auth.uid(),
      user2_anonymous = p_anonymous
  where m.id = (
    select id from public.matches
    where status = 'searching' and user1_id <> auth.uid()
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning m.* into v_match;

  if found then
    return query select v_match.id, v_match.user1_id, v_match.user2_id, v_match.status, true;
    return;
  end if;

  insert into public.matches (user1_id, user1_anonymous)
  values (auth.uid(), p_anonymous)
  returning * into v_match;

  return query select v_match.id, v_match.user1_id, v_match.user2_id, v_match.status, false;
end;
$$ language plpgsql security definer;

grant execute on function public.try_join_match(boolean) to authenticated;

-- 5. MATCH PHOTOS TABLE (Ephemeral Snapchat-style photos)
create table if not exists public.match_photos (
  id uuid default uuid_generate_v4() primary key,
  match_id uuid references public.matches(id) on delete cascade not null,
  sender_id uuid references auth.users(id) on delete cascade not null,
  photo_url text not null,
  viewed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.match_photos enable row level security;
-- Both users in the match can view the photo
create policy "Users in match can view photos." on public.match_photos for select using (
  exists (select 1 from public.matches m where m.id = match_photos.match_id and (m.user1_id = auth.uid() or m.user2_id = auth.uid()))
);
-- Only the sender can upload
create policy "Users can insert their own photos." on public.match_photos for insert with check ( auth.uid() = sender_id );
-- Allowed to update 'viewed' status
create policy "Users in match can update photo status." on public.match_photos for update using (
  exists (select 1 from public.matches m where m.id = match_photos.match_id and (m.user1_id = auth.uid() or m.user2_id = auth.uid()))
);


-- 6. STORAGE BUCKETS FOR IMAGES
-- Create reels bucket
insert into storage.buckets (id, name, public) values ('reels', 'reels', true) on conflict do nothing;
-- Create matches bucket
insert into storage.buckets (id, name, public) values ('matches', 'matches', true) on conflict do nothing;

-- Storage policies for reels
create policy "Anyone can view reels" on storage.objects for select using ( bucket_id = 'reels' );
create policy "Authenticated users can upload reels" on storage.objects for insert with check ( bucket_id = 'reels' and auth.role() = 'authenticated' );

-- Storage policies for matches
create policy "Anyone can view match photos" on storage.objects for select using ( bucket_id = 'matches' );
create policy "Authenticated users can upload match photos" on storage.objects for insert with check ( bucket_id = 'matches' and auth.role() = 'authenticated' );
