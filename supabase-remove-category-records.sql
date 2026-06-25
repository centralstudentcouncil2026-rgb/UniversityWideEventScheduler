-- CSC S.Y.N.C. cleanup: remove database-stored schedule categories
-- Run this once in Supabase SQL Editor.
-- Categories are now hard-coded in the application, so calendar_items should only store schedules and blocked times.

begin;

-- Remove old category rows such as gathering, meeting, outreach, worship, etc.
delete from public.calendar_items
where record_type = 'category';

-- Remove old category-specific columns. Schedules still keep category_id as text
-- so the app can map them to the hard-coded category options.
alter table public.calendar_items drop column if exists category_name;
alter table public.calendar_items drop column if exists category_color;
alter table public.calendar_items drop column if exists category_active;

-- Replace any old record_type check that still allowed category rows.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'calendar_items'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%record_type%category%'
  loop
    execute format('alter table public.calendar_items drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.calendar_items
  add constraint calendar_items_record_type_no_category_check
  check (record_type in ('schedule', 'blocked_time'));

-- Recreate read policies without category access.
drop policy if exists calendar_items_public_read on public.calendar_items;
create policy calendar_items_public_read on public.calendar_items
  for select to anon
  using (
    record_type = 'blocked_time'
    or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic')
  );

drop policy if exists calendar_items_authenticated_read on public.calendar_items;
create policy calendar_items_authenticated_read on public.calendar_items
  for select to authenticated
  using (
    record_type = 'blocked_time'
    or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic')
    or created_by = auth.uid()
    or public.is_enabled_admin()
  );

drop policy if exists calendar_items_authenticated_write on public.calendar_items;
create policy calendar_items_authenticated_write on public.calendar_items
  for all to authenticated
  using (created_by = auth.uid() or public.is_enabled_admin())
  with check (
    (record_type = 'schedule' and (created_by = auth.uid() or public.is_enabled_admin()))
    or (record_type = 'blocked_time' and public.is_enabled_admin())
  );

notify pgrst, 'reload schema';

commit;
