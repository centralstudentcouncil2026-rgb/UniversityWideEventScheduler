-- CSC S.Y.N.C. organizations RLS fix
-- Run this once in the Supabase SQL Editor if saving fails with:
-- organizations: new row violates row-level security policy for table "organizations"

begin;

alter table public.organizations enable row level security;

drop policy if exists organizations_public_read on public.organizations;
create policy organizations_public_read
on public.organizations
for select
to anon, authenticated
using (true);

drop policy if exists organizations_admin_insert on public.organizations;
create policy organizations_admin_insert
on public.organizations
for insert
to authenticated
with check (public.is_enabled_admin());

drop policy if exists organizations_admin_update on public.organizations;
create policy organizations_admin_update
on public.organizations
for update
to authenticated
using (public.is_enabled_admin())
with check (public.is_enabled_admin());

drop policy if exists organizations_admin_delete on public.organizations;
create policy organizations_admin_delete
on public.organizations
for delete
to authenticated
using (public.is_enabled_admin());

grant select on public.organizations to anon, authenticated;
grant insert, update, delete on public.organizations to authenticated;

notify pgrst, 'reload schema';

commit;
