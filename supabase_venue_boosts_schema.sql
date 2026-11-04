-- Paid venue boosts. This table is intentionally NOT writable by
-- anon/authenticated clients — a boost is only ever created by the
-- Stripe webhook (service_role), after payment is actually confirmed.
-- See STRIPE_BOOST_SETUP.md for the Edge Function that writes to this
-- table. Idempotent: safe to run multiple times.

create table if not exists public.venue_boosts (
  id uuid default uuid_generate_v4() primary key,
  venue_id uuid references public.venues(id) on delete cascade not null,
  stripe_session_id text unique,
  starts_at timestamp with time zone not null default now(),
  ends_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.venue_boosts enable row level security;

-- Everyone can see *that* a venue is currently boosted (needed to render it
-- on the map) — nobody but service_role can create/modify a boost row.
create policy "Active boosts are viewable by everyone." on public.venue_boosts
  for select using ( true );

create index if not exists venue_boosts_venue_idx on public.venue_boosts (venue_id);
create index if not exists venue_boosts_active_idx on public.venue_boosts (ends_at) where ends_at > now();

grant select on public.venue_boosts to anon, authenticated;
grant all on public.venue_boosts to service_role;
-- Deliberately no insert/update/delete grant for anon/authenticated:
-- only the Stripe webhook (service_role key, server-side only) may write here.
