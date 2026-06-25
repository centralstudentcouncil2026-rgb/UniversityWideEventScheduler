-- CSC S.Y.N.C. profile-based activity statuses
-- Run this once in the Supabase SQL Editor.
-- This moves CSC/OIC status into public.profiles and removes separate status/log tables if present.

begin;

alter table public.profiles add column if not exists activity_status text default 'Status not posted';
alter table public.profiles add column if not exists status_label text default 'Status not posted';
alter table public.profiles add column if not exists status_updated_by text;
alter table public.profiles add column if not exists status_updated_at timestamptz;

update public.profiles
set full_name = 'OIC (Off Campus/In Campus Coordinator)',
    account_type = 'OIC',
    updated_at = now()
where lower(email) = 'cscadmin1@aup.edu.ph';

update public.profiles
set full_name = 'CSC President',
    account_type = 'CSC',
    updated_at = now()
where lower(email) = 'cscadmin2@aup.edu.ph';

do $$
begin
  if to_regclass('public.activity_statuses') is not null then
    update public.profiles p
    set activity_status = coalesce(s.activity_status, p.activity_status, 'Status not posted'),
        status_label = coalesce(s.status_label, s.activity_status, p.status_label, 'Status not posted'),
        status_updated_by = coalesce(s.updated_by, p.status_updated_by),
        status_updated_at = coalesce(s.updated_at, p.status_updated_at),
        updated_at = now()
    from public.activity_statuses s
    where s.id = 'oic'
      and lower(p.email) = 'cscadmin1@aup.edu.ph';

    update public.profiles p
    set activity_status = coalesce(s.activity_status, p.activity_status, 'Status not posted'),
        status_label = coalesce(s.status_label, s.activity_status, p.status_label, 'Status not posted'),
        status_updated_by = coalesce(s.updated_by, p.status_updated_by),
        status_updated_at = coalesce(s.updated_at, p.status_updated_at),
        updated_at = now()
    from public.activity_statuses s
    where s.id = 'csc'
      and lower(p.email) = 'cscadmin2@aup.edu.ph';
  end if;
end $$;

alter table public.profiles enable row level security;

drop policy if exists profiles_status_public_read on public.profiles;
create policy profiles_status_public_read
on public.profiles
for select
to anon, authenticated
using (lower(email) in ('cscadmin1@aup.edu.ph', 'cscadmin2@aup.edu.ph'));

drop policy if exists profiles_status_owner_update on public.profiles;
create policy profiles_status_owner_update
on public.profiles
for update
to authenticated
using (
  lower(email) = lower(auth.jwt() ->> 'email')
  and lower(email) in ('cscadmin1@aup.edu.ph', 'cscadmin2@aup.edu.ph')
)
with check (
  lower(email) = lower(auth.jwt() ->> 'email')
  and lower(email) in ('cscadmin1@aup.edu.ph', 'cscadmin2@aup.edu.ph')
);

grant select (id, email, full_name, account_type, activity_status, status_label, status_updated_by, status_updated_at)
on public.profiles to anon, authenticated;

grant update (account_type, activity_status, status_label, status_updated_by, status_updated_at, updated_at)
on public.profiles to authenticated;

drop table if exists public.activity_statuses cascade;
drop table if exists public.activity_logs cascade;

notify pgrst, 'reload schema';

commit;
