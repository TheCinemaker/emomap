-- Venues: the first piece of the monetization layer ("venue owners show up,
-- advertise themselves, pay"). Claiming a venue is free — it's the growth
-- mechanic. The paid "Boost" product is a separate table added later,
-- once Stripe payment verification (a server-side webhook) exists — see
-- STRIPE_BOOST_SETUP.md. Idempotent: safe to run multiple times.

create table if not exists public.venues (
  id uuid default uuid_generate_v4() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  lat numeric not null,
  lng numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.venues enable row level security;

create policy "Venues are viewable by everyone." on public.venues for select using ( true );
create policy "Users can claim a venue." on public.venues for insert with check ( auth.uid() = owner_id );
create policy "Owners can update their own venue." on public.venues for update using ( auth.uid() = owner_id );
create policy "Owners can delete their own venue." on public.venues for delete using ( auth.uid() = owner_id );

create index if not exists venues_lat_lng_idx on public.venues (lat, lng);

-- Explicit GRANTs (same Data API requirement as supabase_grants_fix.sql)
grant select on public.venues to anon, authenticated;
grant insert, update, delete on public.venues to authenticated;
grant all on public.venues to service_role;
