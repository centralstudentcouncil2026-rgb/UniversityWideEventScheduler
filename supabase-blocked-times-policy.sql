-- CSC S.Y.N.C. blocked-calendar policy update.
-- Run once in Supabase SQL Editor. Blocks are public calendar entries but
-- only their CSC Admin creator can add, edit, or remove them.

grant select on public.blocked_times to anon;
grant select, insert, update, delete on public.blocked_times to authenticated;

alter table public.blocked_times enable row level security;

drop policy if exists blocked_times_public_select on public.blocked_times;
create policy blocked_times_public_select
  on public.blocked_times
  for select
  to anon, authenticated
  using (true);

drop policy if exists blocked_times_creator_insert on public.blocked_times;
create policy blocked_times_creator_insert
  on public.blocked_times
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and record_type = 'blocked_time'
    and block_source = 'admin'
    and created_by_role = 'admin'
    and requires_approval = false
    and exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid()
        and profile.role = 'super_admin'
        and coalesce((profile.permissions ->> 'enabled')::boolean, false)
    )
  );

drop policy if exists blocked_times_creator_update on public.blocked_times;
create policy blocked_times_creator_update
  on public.blocked_times
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (
    created_by = auth.uid()
    and record_type = 'blocked_time'
    and block_source = 'admin'
    and created_by_role = 'admin'
    and requires_approval = false
  );

drop policy if exists blocked_times_creator_delete on public.blocked_times;
create policy blocked_times_creator_delete
  on public.blocked_times
  for delete
  to authenticated
  using (created_by = auth.uid());

notify pgrst, 'reload schema';
