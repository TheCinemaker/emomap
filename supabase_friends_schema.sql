-- Friends system: mutual friend requests (not one-way "follow"), the
-- foundation for friends-only mood visibility and (next phase) chat.
-- Idempotent: safe to run multiple times.

create table if not exists public.friendships (
  id uuid default uuid_generate_v4() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  addressee_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  responded_at timestamptz,
  check (requester_id <> addressee_id),
  unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

-- Either side of a friendship/request can see it.
create policy "Users can view their own friendships." on public.friendships
  for select using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester can create a request, as themselves.
create policy "Users can send a friend request." on public.friendships
  for insert with check (auth.uid() = requester_id);

-- Only the addressee can accept/decline; only on their own pending request.
create policy "Addressee can respond to a request." on public.friendships
  for update using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

-- Either side can remove a friendship/request (cancel a pending one, or unfriend).
create policy "Either side can delete a friendship." on public.friendships
  for delete using (auth.uid() = requester_id or auth.uid() = addressee_id);

create index if not exists friendships_requester_idx on public.friendships (requester_id, status);
create index if not exists friendships_addressee_idx on public.friendships (addressee_id, status);

grant select, insert, update, delete on public.friendships to authenticated;
grant all on public.friendships to service_role;
