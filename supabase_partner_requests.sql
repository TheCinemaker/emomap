-- Lead capture for "I want to advertise my venue" — Partner CRM access
-- (profiles.is_partner) stays manual/invite-only by deliberate product
-- decision (see supabase_venue_crm_schema.sql), but until now there was
-- NO way for an interested business to even express that interest: no
-- button, no form, nothing. With real traffic arriving (Reddit/X posts
-- live, 2026-11-09), a business owner landing on the site had no path at
-- all and would just leave. This captures the lead instead of losing it.
--
-- Open to anon AND authenticated — a prospective business contact
-- shouldn't have to create a personal mood-tracking account just to ask
-- about advertising.
--
-- Idempotent: safe to run multiple times.

create table if not exists public.partner_requests (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete set null,
  business_name text not null check (char_length(business_name) between 1 and 200),
  contact_name text not null check (char_length(contact_name) between 1 and 120),
  contact_email text not null check (char_length(contact_email) between 3 and 200),
  contact_phone text,
  city text,
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.partner_requests enable row level security;

-- Basic flood guard — same pattern as supabase_rate_limits.sql. Global
-- (not per-user — anon has no identity to key on), caps the whole table's
-- submission rate rather than any individual requester: stops a scripted
-- flood while staying generous for real traffic (nobody sends more than a
-- handful of genuine partner inquiries in 5 minutes).
create or replace function public.check_partner_request_rate_limit()
returns boolean as $$
  select (
    select count(*) from public.partner_requests
    where created_at > now() - interval '5 minutes'
  ) < 20;
$$ language sql stable;

-- Anyone (guest or logged in) can submit a request. No read/update access
-- for anon/authenticated at all — this is a one-way mailbox; only you,
-- reading as the project owner in the SQL editor (which runs as postgres,
-- bypassing RLS), can see or action submissions.
drop policy if exists "Anyone can submit a partner request." on public.partner_requests;
create policy "Anyone can submit a partner request." on public.partner_requests
  for insert with check (public.check_partner_request_rate_limit());

grant insert on public.partner_requests to anon, authenticated;
grant all on public.partner_requests to service_role;

-- Review your leads with, e.g.:
--   select * from public.partner_requests order by created_at desc;
-- Approve one with:
--   update public.profiles set is_partner = true where id = '<user_id>';
-- (only works for requests made while logged in — a guest's request has
-- user_id = null, so approve those by creating/linking an account first.)
