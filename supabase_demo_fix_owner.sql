-- One-time fix: supabase_demo_seed.sql attached the 18 demo friendships
-- (and their chat history) to avar.szilveszter@gmail.com, but the account
-- actually logged into the live app is koszegfotok@gmail.com. Re-points
-- every demo-created friendship/message row from the wrong account to the
-- right one. Scoped (via the is_demo tag on the OTHER side of each row) so
-- it can't touch any unrelated real friendship/message either account may
-- have. Idempotent: safe to run more than once — after the first run,
-- nothing left matches the "wrong" account, so later runs are no-ops.

-- Friendships where the wrong account was the requester
update public.friendships f
set requester_id = (select id from auth.users where email = 'koszegfotok@gmail.com')
from auth.users wrong
where wrong.email = 'avar.szilveszter@gmail.com'
  and f.requester_id = wrong.id
  and exists (
    select 1 from auth.users du
    where du.id = f.addressee_id and du.raw_user_meta_data->>'is_demo' = 'true'
  );

-- Friendships where the wrong account was the addressee
update public.friendships f
set addressee_id = (select id from auth.users where email = 'koszegfotok@gmail.com')
from auth.users wrong
where wrong.email = 'avar.szilveszter@gmail.com'
  and f.addressee_id = wrong.id
  and exists (
    select 1 from auth.users du
    where du.id = f.requester_id and du.raw_user_meta_data->>'is_demo' = 'true'
  );

-- Messages where the wrong account was the sender
update public.messages m
set sender_id = (select id from auth.users where email = 'koszegfotok@gmail.com')
from auth.users wrong
where wrong.email = 'avar.szilveszter@gmail.com'
  and m.sender_id = wrong.id
  and exists (
    select 1 from auth.users du
    where du.id = m.recipient_id and du.raw_user_meta_data->>'is_demo' = 'true'
  );

-- Messages where the wrong account was the recipient
update public.messages m
set recipient_id = (select id from auth.users where email = 'koszegfotok@gmail.com')
from auth.users wrong
where wrong.email = 'avar.szilveszter@gmail.com'
  and m.recipient_id = wrong.id
  and exists (
    select 1 from auth.users du
    where du.id = m.sender_id and du.raw_user_meta_data->>'is_demo' = 'true'
  );
