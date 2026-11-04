-- Partner Mini CRM: extends venues with the paid-partner POI/flyer fields,
-- gates venue creation to partners only (Phase 1 = manually activated via
-- `update public.profiles set is_partner = true where id = '...'` in the
-- SQL editor — no self-serve payment flow yet, see VENUE_CRM_PLAN.md),
-- adds a storage bucket for logos/flyers, and atomic view/click counters.
-- Idempotent: safe to run multiple times.

-- 1. Partner flag — who even gets the "Partner CRM" entry point in the UI.
alter table public.profiles
  add column if not exists is_partner boolean not null default false;

-- 2. Extend venues with the POI/flyer/tier fields.
alter table public.venues
  add column if not exists category text default 'club',
  add column if not exists logo_url text,
  add column if not exists flyer_url text,
  add column if not exists headline text,
  add column if not exists description text,
  add column if not exists cta_label text,
  add column if not exists cta_url text,
  add column if not exists tier text not null default 'basic' check (tier in ('basic', 'vip')),
  add column if not exists is_active boolean not null default true,
  add column if not exists views_count bigint not null default 0,
  add column if not exists clicks_count bigint not null default 0,
  -- Prepared for a later ticketing module, not used by any UI yet.
  add column if not exists ticketing_enabled boolean not null default false,
  add column if not exists ticket_price_huf integer,
  add column if not exists ticket_event_id uuid,
  add column if not exists updated_at timestamptz default timezone('utc'::text, now()) not null;

-- 3. Re-gate venue creation: this used to be a free, anyone-can-claim
-- mass feature (VenueClaim.jsx). It's now a paid B2B feature — only
-- partners may create one. Existing owner-manages-own-row update/delete
-- policies are untouched; only INSERT changes.
drop policy if exists "Users can claim a venue." on public.venues;
create policy "Partners can create a venue." on public.venues
  for insert with check (
    auth.uid() = owner_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_partner = true)
  );

-- 4. Atomic counters — a plain client-side `set x = x + 1` isn't race-safe
-- (two viewers at once would clobber each other's increment).
create or replace function public.increment_venue_counter(p_venue_id uuid, p_counter text)
returns void
language plpgsql
security definer
as $$
begin
  if p_counter = 'views' then
    update public.venues set views_count = views_count + 1 where id = p_venue_id;
  elsif p_counter = 'clicks' then
    update public.venues set clicks_count = clicks_count + 1 where id = p_venue_id;
  end if;
end;
$$;

grant execute on function public.increment_venue_counter(uuid, text) to anon, authenticated;

-- 5. Storage bucket for venue logos/flyers — public read, owner-folder write,
-- same pattern as supabase_avatars_schema.sql.
insert into storage.buckets (id, name, public) values ('venues', 'venues', true)
  on conflict (id) do update set public = true;

drop policy if exists "venues_media_select" on storage.objects;
create policy "venues_media_select" on storage.objects
  for select using ( bucket_id = 'venues' );

drop policy if exists "venues_media_insert" on storage.objects;
create policy "venues_media_insert" on storage.objects
  for insert with check (
    bucket_id = 'venues'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "venues_media_update" on storage.objects;
create policy "venues_media_update" on storage.objects
  for update using (
    bucket_id = 'venues'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "venues_media_delete" on storage.objects;
create policy "venues_media_delete" on storage.objects
  for delete using (
    bucket_id = 'venues'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
