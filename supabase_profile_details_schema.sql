-- Extended, opt-in profile fields (name, phone, address, birth date,
-- contact note, social links). Deliberately a SEPARATE table from
-- `profiles`, because `profiles` has `select using (true)` — world
-- readable — and these fields must NOT be. Per-field visibility (not just
-- "friends can see this row or not") can't be done with RLS alone (RLS
-- masks whole ROWS, not individual columns), so:
--   - The owner can read/write their own row directly (for the edit UI).
--   - Nobody else gets a direct SELECT grant on this table at all.
--   - Friends see only the fields the owner explicitly toggled on, via the
--     get_visible_profile_details() function below, which checks the
--     friendship and nulls out everything not in visible_fields — enforced
--     server-side, not just hidden in the UI.
-- All fields are opt-in; visible_fields defaults to empty (nothing shared).
-- Idempotent: safe to run multiple times.

create table if not exists public.profile_details (
  user_id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  phone text,
  address text,
  birth_date date,
  contact_note text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  website_url text,
  visible_fields text[] not null default '{}',
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.profile_details enable row level security;

create policy "Owner manages their own details." on public.profile_details
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.profile_details to authenticated;
grant all on public.profile_details to service_role;

-- Friends-only, per-field-masked read. Returns one row (possibly all-null
-- fields) if target_id has accepted-friended the caller, no rows otherwise.
create or replace function public.get_visible_profile_details(target_id uuid)
returns table (
  full_name text,
  phone text,
  address text,
  birth_date date,
  contact_note text,
  facebook_url text,
  instagram_url text,
  tiktok_url text,
  website_url text
)
language plpgsql
security definer
stable
as $$
declare
  is_friend boolean;
  d public.profile_details%rowtype;
begin
  if target_id = auth.uid() then
    is_friend := true;
  else
    select exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester_id = auth.uid() and f.addressee_id = target_id)
          or (f.requester_id = target_id and f.addressee_id = auth.uid())
        )
    ) into is_friend;
  end if;

  if not is_friend then
    return;
  end if;

  select * into d from public.profile_details where user_id = target_id;
  if not found then
    return;
  end if;

  return query select
    case when 'full_name' = any(d.visible_fields) or target_id = auth.uid() then d.full_name else null end,
    case when 'phone' = any(d.visible_fields) or target_id = auth.uid() then d.phone else null end,
    case when 'address' = any(d.visible_fields) or target_id = auth.uid() then d.address else null end,
    case when 'birth_date' = any(d.visible_fields) or target_id = auth.uid() then d.birth_date else null end,
    case when 'contact_note' = any(d.visible_fields) or target_id = auth.uid() then d.contact_note else null end,
    case when 'facebook_url' = any(d.visible_fields) or target_id = auth.uid() then d.facebook_url else null end,
    case when 'instagram_url' = any(d.visible_fields) or target_id = auth.uid() then d.instagram_url else null end,
    case when 'tiktok_url' = any(d.visible_fields) or target_id = auth.uid() then d.tiktok_url else null end,
    case when 'website_url' = any(d.visible_fields) or target_id = auth.uid() then d.website_url else null end;
end;
$$;

grant execute on function public.get_visible_profile_details(uuid) to authenticated;
