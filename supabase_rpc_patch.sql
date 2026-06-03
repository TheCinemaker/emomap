-- Szükséges RPC függvény a felhasználónév alapú bejelentkezéshez
-- Az Auth.jsx a supabase.rpc('email_for_username', ...) hívást használja
create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer
stable
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(p_username)
  limit 1;
$$;
