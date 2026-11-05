-- Google/Apple sign-in support: auto-generate a username for OAuth users.
--
-- Why this is needed: handle_new_user() (supabase_schema.sql) previously
-- only ever set profiles.username from raw_user_meta_data->>'username',
-- which Auth.jsx's email+password signup provides explicitly. Google/Apple
-- OAuth never provides a 'username' key — Supabase instead gives us
-- whatever the provider shares (name/full_name, email, avatar). Without
-- this fix, every OAuth sign-up would get username = NULL forever,
-- silently breaking "find a friend by username" search and the @username
-- shown on Pulses/Chat.
--
-- Explicit product call (2026-11-05): no username-picker screen after
-- OAuth login — it should be a single tap, like Facebook. So this
-- generates a reasonable, unique username automatically from the
-- provider's name/email instead of blocking on user input. The user can
-- still be identified by whatever they're given; nothing here prevents
-- adding a "change your username later" setting if that's wanted.
--
-- Idempotent: safe to run multiple times.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_username text;
  base_username text;
  candidate text;
  suffix int;
begin
  raw_username := new.raw_user_meta_data->>'username';

  if raw_username is not null and raw_username <> '' then
    -- Email+password signup path (Auth.jsx already validated this is a
    -- free, well-formed username before calling supabase.auth.signUp).
    insert into public.profiles (id, username)
    values (new.id, raw_username);
    return new;
  end if;

  -- OAuth path (Google/Apple): derive a starting point from whatever name
  -- or email the provider gave us, then sanitize to the same
  -- [a-z0-9_]{3,20} shape Auth.jsx's USERNAME_RE enforces for manual
  -- signups, so OAuth users look like any other user everywhere else.
  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user'
  );
  base_username := regexp_replace(lower(base_username), '[^a-z0-9_]', '', 'g');
  base_username := left(base_username, 15);
  if length(base_username) < 3 then
    base_username := left('user' || base_username, 15);
  end if;

  -- Find a free username, appending 1/2/3/... on collision.
  candidate := base_username;
  suffix := 0;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_username, 15) || suffix::text;
  end loop;

  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    candidate,
    nullif(coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), '')
  );
  return new;
end;
$$;

-- Trigger itself is unchanged (still fires the function above on every new
-- auth.users row, regardless of which provider created it) — recreated
-- here only so this file is a complete, standalone, idempotent migration.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
