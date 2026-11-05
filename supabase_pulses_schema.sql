-- Pulses (global public short visual stories — formerly Reels strip):
-- Everyone can upload, everyone can view, like (❤️), comment (💬),
-- repost (🔁), share (📤), and report (🚩).
-- Includes automatic community moderation trigger: 2 reports auto-deletes the Pulse.
-- Idempotent: safe to run multiple times.

alter table public.reels
  add column if not exists caption text check (caption is null or char_length(caption) <= 300),
  add column if not exists emotion text;

-- 1. Likes (❤️)
create table if not exists public.reel_likes (
  reel_id uuid references public.reels(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  primary key (reel_id, user_id)
);

alter table public.reel_likes enable row level security;

drop policy if exists "Reel likes are viewable by everyone." on public.reel_likes;
create policy "Reel likes are viewable by everyone." on public.reel_likes
  for select using (true);

drop policy if exists "Users can like reels." on public.reel_likes;
create policy "Users can like reels." on public.reel_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can unlike reels." on public.reel_likes;
create policy "Users can unlike reels." on public.reel_likes
  for delete using (auth.uid() = user_id);

create index if not exists reel_likes_reel_idx on public.reel_likes (reel_id);
grant select on public.reel_likes to anon, authenticated;
grant insert, delete on public.reel_likes to authenticated;
grant all on public.reel_likes to service_role;

-- 2. Comments (💬)
create table if not exists public.reel_comments (
  id uuid default uuid_generate_v4() primary key,
  reel_id uuid references public.reels(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.reel_comments enable row level security;

drop policy if exists "Reel comments are viewable by everyone." on public.reel_comments;
create policy "Reel comments are viewable by everyone." on public.reel_comments
  for select using (true);

drop policy if exists "Users can comment on reels." on public.reel_comments;
create policy "Users can comment on reels." on public.reel_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own comments." on public.reel_comments;
create policy "Users can delete own comments." on public.reel_comments
  for delete using (auth.uid() = user_id);

create index if not exists reel_comments_reel_idx on public.reel_comments (reel_id, created_at);
grant select on public.reel_comments to anon, authenticated;
grant insert, delete on public.reel_comments to authenticated;
grant all on public.reel_comments to service_role;

-- 3. Reposts (🔁)
create table if not exists public.reel_reposts (
  reel_id uuid references public.reels(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  primary key (reel_id, user_id)
);

alter table public.reel_reposts enable row level security;

drop policy if exists "Reel reposts are viewable by everyone." on public.reel_reposts;
create policy "Reel reposts are viewable by everyone." on public.reel_reposts
  for select using (true);

drop policy if exists "Users can repost reels." on public.reel_reposts;
create policy "Users can repost reels." on public.reel_reposts
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can unrepost reels." on public.reel_reposts;
create policy "Users can unrepost reels." on public.reel_reposts
  for delete using (auth.uid() = user_id);

create index if not exists reel_reposts_reel_idx on public.reel_reposts (reel_id);
grant select on public.reel_reposts to anon, authenticated;
grant insert, delete on public.reel_reposts to authenticated;
grant all on public.reel_reposts to service_role;

-- 4. Community Reports + Auto-Trash Trigger (🚩 -> auto-delete at 2 reports)
create table if not exists public.reel_reports (
  reel_id uuid references public.reels(id) on delete cascade not null,
  reporter_id uuid references auth.users(id) on delete cascade not null,
  reason text default 'inappropriate',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  primary key (reel_id, reporter_id)
);

alter table public.reel_reports enable row level security;

drop policy if exists "Users can report reels." on public.reel_reports;
create policy "Users can report reels." on public.reel_reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "Users can view own reports." on public.reel_reports;
create policy "Users can view own reports." on public.reel_reports
  for select using (auth.uid() = reporter_id);

grant select, insert on public.reel_reports to authenticated;
grant all on public.reel_reports to service_role;

create or replace function public.handle_reel_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_cnt int;
begin
  select count(*) into report_cnt
  from public.reel_reports
  where reel_id = new.reel_id;

  if report_cnt >= 2 then
    delete from public.reels where id = new.reel_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_reel_reported on public.reel_reports;
create trigger on_reel_reported
  after insert on public.reel_reports
  for each row execute procedure public.handle_reel_report();

-- Enable Realtime on the new social tables
do $$
declare
  t text;
begin
  foreach t in array array['reel_likes', 'reel_comments', 'reel_reposts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

