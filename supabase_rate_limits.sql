-- Server-side rate limits / spam protection for every write path that had
-- NONE yet (mood voting already had a 2-minute cooldown via cast_vote —
-- see supabase_single_active_vote.sql). Explicit user request (2026-11-06):
-- about to post EmoMap to Reddit/Twitter, "a rate limit! spam védelem. ez
-- eszembe sem jutott!" — before real traffic arrives is the right time.
--
-- Same pattern as the existing check_emotion_rate_limit(): a small
-- SECURITY DEFINER function returning boolean, referenced from the table's
-- own INSERT policy's WITH CHECK. A client hitting the limit gets a normal
-- RLS-denial error (Postgres code 42501) from PostgREST — no new error
-- shape to handle everywhere, same as any other policy violation.
--
-- Deliberately NOT rate-limiting reel_likes/reel_reposts: both are a
-- toggle on a (reel_id, user_id) primary key, so a user can only ever have
-- one like/repost live per Pulse regardless of how fast they tap — the
-- primary key itself is already the spam cap. Adding a cooldown there
-- would only risk breaking the double-tap-to-like UI for no real benefit.
--
-- Idempotent: safe to run multiple times.

-- 1. Pulses (reels) upload — 1 per 2 minutes per user, same cadence as a
-- mood vote. Posting a photo is far heavier (storage + AI moderation) than
-- a vote, so this is a floor, not a tight cap.
create or replace function public.check_reel_rate_limit()
returns boolean as $$
  select not exists (
    select 1 from public.reels
    where user_id = auth.uid() and created_at > now() - interval '2 minutes'
  );
$$ language sql security definer stable;

drop policy if exists "Users can insert their own reels." on public.reels;
create policy "Users can insert their own reels (rate-limited)." on public.reels
  for insert with check ( auth.uid() = user_id and public.check_reel_rate_limit() );

-- 2. Pulse comments — 1 per 5 seconds per user. Tight enough to stop a
-- flood script, loose enough that no real person will ever notice it.
create or replace function public.check_comment_rate_limit()
returns boolean as $$
  select not exists (
    select 1 from public.reel_comments
    where user_id = auth.uid() and created_at > now() - interval '5 seconds'
  );
$$ language sql security definer stable;

drop policy if exists "Users can comment on reels." on public.reel_comments;
create policy "Users can comment on reels (rate-limited)." on public.reel_comments
  for insert with check ( auth.uid() = user_id and public.check_comment_rate_limit() );

-- 3. Messages — max 20 per rolling 60 seconds per sender. Generous enough
-- that a real back-and-forth conversation never feels it, but a bot
-- flooding a friend (or flooding itself via a scripted account) hits a
-- wall fast.
create or replace function public.check_message_rate_limit()
returns boolean as $$
  select (
    select count(*) from public.messages
    where sender_id = auth.uid() and created_at > now() - interval '60 seconds'
  ) < 20;
$$ language sql security definer stable;

drop policy if exists "Friends can message each other." on public.messages;
create policy "Friends can message each other (rate-limited)." on public.messages
  for insert with check (
    auth.uid() = sender_id
    and public.check_message_rate_limit()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = messages.sender_id and f.addressee_id = messages.recipient_id)
          or (f.requester_id = messages.recipient_id and f.addressee_id = messages.sender_id)
        )
    )
  );

-- 4. Friend requests — max 10 new outgoing requests per rolling hour per
-- user. Stops a script from mass-adding every username it can enumerate.
create or replace function public.check_friend_request_rate_limit()
returns boolean as $$
  select (
    select count(*) from public.friendships
    where requester_id = auth.uid() and created_at > now() - interval '1 hour'
  ) < 10;
$$ language sql security definer stable;

drop policy if exists "Users can send a friend request." on public.friendships;
create policy "Users can send a friend request (rate-limited)." on public.friendships
  for insert with check ( auth.uid() = requester_id and public.check_friend_request_rate_limit() );

-- 5. Report-brigading hardening: 2 reports was enough for a single hostile
-- pair of accounts to auto-delete anyone's Pulse. Raised to 3 — still fast
-- for genuine community moderation, a little harder for two throwaway
-- accounts to abuse. (reel_reports' primary key (reel_id, reporter_id)
-- already stops one account from reporting the same Pulse twice.)
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

  if report_cnt >= 3 then
    delete from public.reels where id = new.reel_id;
  end if;
  return new;
end;
$$;
