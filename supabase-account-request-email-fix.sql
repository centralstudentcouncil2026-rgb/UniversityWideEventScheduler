-- Run this once in the Supabase SQL Editor after the relational reset.
-- It corrects the AUP email validation rule used by organization signup.

begin;

alter table public.account_requests
  drop constraint if exists account_requests_aup_email_check;

alter table public.account_requests
  add constraint account_requests_aup_email_check
  check (aup_email ~* '^[^@[:space:]]+@aup[.]edu[.]ph$');

-- Recover pending profiles created before the request insert failed.
insert into public.account_requests (
  user_id,
  full_name,
  aup_email,
  contact_number,
  organization_name,
  status
)
select
  profile.id,
  profile.full_name,
  lower(profile.email),
  profile.contact_number,
  profile.organization_name,
  'pending'
from public.profiles as profile
where profile.role = 'organization_manager'
  and profile.approval_status = 'pending'
  and profile.organization_name is not null
  and profile.contact_number ~ '^[0-9]{11}$'
  and lower(profile.email) ~* '^[^@[:space:]]+@aup[.]edu[.]ph$'
on conflict (user_id) do update
set full_name = excluded.full_name,
    aup_email = excluded.aup_email,
    contact_number = excluded.contact_number,
    organization_name = excluded.organization_name,
    status = 'pending',
    updated_at = now();

commit;
