-- CSC S.Y.N.C. activity status table
-- Run this once in the Supabase SQL Editor.
-- cscadmin1@aup.edu.ph updates OIC status.
-- cscadmin2@aup.edu.ph updates CSC President status.
-- Both statuses are readable by public, organization, and admin dashboards.

begin;

create table if not exists public.activity_statuses (
  id text primary key check (id in ('oic', 'csc')),
  account_id uuid references auth.users(id) on delete set null,
  account_type text not null check (account_type in ('OIC', 'CSC')),
  activity_status text not null,
  status_label text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.activity_statuses enable row level security;

drop policy if exists activity_statuses_public_read on public.activity_statuses;
create policy activity_statuses_public_read
on public.activity_statuses
for select
to anon, authenticated
using (true);

drop policy if exists activity_statuses_insert_owners on public.activity_statuses;
create policy activity_statuses_insert_owners
on public.activity_statuses
for insert
to authenticated
with check (
  (id = 'oic' and lower(auth.jwt() ->> 'email') = 'cscadmin1@aup.edu.ph')
  or
  (id = 'csc' and lower(auth.jwt() ->> 'email') = 'cscadmin2@aup.edu.ph')
);

drop policy if exists activity_statuses_update_owners on public.activity_statuses;
create policy activity_statuses_update_owners
on public.activity_statuses
for update
to authenticated
using (
  (id = 'oic' and lower(auth.jwt() ->> 'email') = 'cscadmin1@aup.edu.ph')
  or
  (id = 'csc' and lower(auth.jwt() ->> 'email') = 'cscadmin2@aup.edu.ph')
)
with check (
  (id = 'oic' and lower(auth.jwt() ->> 'email') = 'cscadmin1@aup.edu.ph')
  or
  (id = 'csc' and lower(auth.jwt() ->> 'email') = 'cscadmin2@aup.edu.ph')
);

grant select on public.activity_statuses to anon, authenticated;
grant insert, update on public.activity_statuses to authenticated;

insert into public.activity_statuses (id, account_type, activity_status, status_label, updated_by)
values
  ('oic', 'OIC', 'Status not posted', 'Status not posted', 'System'),
  ('csc', 'CSC', 'Status not posted', 'Status not posted', 'System')
on conflict (id) do nothing;

notify pgrst, 'reload schema';

commit;
