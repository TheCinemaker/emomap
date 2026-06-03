-- Change reels expiry from 24 hours to 20 minutes
alter table public.reels
  alter column expires_at set default (now() + interval '20 minutes');
