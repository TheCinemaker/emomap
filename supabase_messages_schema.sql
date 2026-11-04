-- 1:1 chat between mutual friends. Deliberately scoped to friends only —
-- no stranger messaging, consistent with the RandomMatch-cut decision
-- (anonymous-stranger contact is the risk, not messaging people you
-- already added as friends). Idempotent: safe to run multiple times.

create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  sender_id uuid references auth.users(id) on delete cascade not null,
  recipient_id uuid references auth.users(id) on delete cascade not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  read_at timestamptz,
  check (sender_id <> recipient_id)
);

alter table public.messages enable row level security;

create policy "Users can view their own conversations." on public.messages
  for select using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Can only message someone you're actually (accepted) friends with —
-- enforced server-side, not just hidden in the UI.
create policy "Friends can message each other." on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = messages.sender_id and f.addressee_id = messages.recipient_id)
          or (f.requester_id = messages.recipient_id and f.addressee_id = messages.sender_id)
        )
    )
  );

-- Only the recipient can mark a message read.
create policy "Recipient can mark messages read." on public.messages
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create index if not exists messages_conversation_idx
  on public.messages (least(sender_id, recipient_id), greatest(sender_id, recipient_id), created_at);
create index if not exists messages_unread_idx
  on public.messages (recipient_id) where read_at is null;

grant select, insert, update on public.messages to authenticated;
grant all on public.messages to service_role;

-- Live push for new messages / read receipts.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
