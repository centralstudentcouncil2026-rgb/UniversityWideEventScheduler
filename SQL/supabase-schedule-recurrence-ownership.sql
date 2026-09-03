-- Schedule recurrence, creator ownership, and edit/delete request support.
-- Run this in the Supabase SQL editor for the CSC S.Y.N.C project.

alter table public.calendar_items
  add column if not exists repeat_rule text,
  add column if not exists repeat_until date,
  add column if not exists recurrence_type text,
  add column if not exists recurrence_until date,
  add column if not exists request_type text,
  add column if not exists request_reason text,
  add column if not exists requester_id uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_items_recurrence_type_check'
      and conrelid = 'public.calendar_items'::regclass
  ) then
    alter table public.calendar_items
      add constraint calendar_items_recurrence_type_check
      check (recurrence_type is null or recurrence_type in ('daily', 'weekly', 'monthly', 'yearly')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_items_request_type_check'
      and conrelid = 'public.calendar_items'::regclass
  ) then
    alter table public.calendar_items
      add constraint calendar_items_request_type_check
      check (request_type is null or request_type in ('edit', 'delete')) not valid;
  end if;
end $$;

create unique index if not exists calendar_items_one_open_schedule_request
on public.calendar_items (revision_of, request_type, requester_id)
where record_type = 'schedule'
  and revision_of is not null
  and request_type in ('edit', 'delete')
  and coalesce(revision_status, approval_status) in ('pending', 'cancel_pending');

alter table public.calendar_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_public_read_approved_schedules'
  ) then
    create policy calendar_items_public_read_approved_schedules
    on public.calendar_items
    for select
    to anon, authenticated
    using (
      record_type = 'schedule'
      and approval_status = 'approved'
      and event_status in ('planned', 'finalized')
      and coalesce(privacy_level, 'public') <> 'internal'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_org_read_own_schedules'
  ) then
    create policy calendar_items_org_read_own_schedules
    on public.calendar_items
    for select
    to authenticated
    using (created_by = auth.uid() or requester_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_super_admin_manage_all'
  ) then
    create policy calendar_items_super_admin_manage_all
    on public.calendar_items
    for all
    to authenticated
    using (exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
        and coalesce(profiles.is_enabled, true) = true
    ))
    with check (exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'super_admin'
        and coalesce(profiles.is_enabled, true) = true
    ));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_org_insert_own_schedules'
  ) then
    create policy calendar_items_org_insert_own_schedules
    on public.calendar_items
    for insert
    to authenticated
    with check (
      record_type = 'schedule'
      and schedule_source = 'organization'
      and created_by = auth.uid()
      and (requester_id is null or requester_id = auth.uid())
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_org_update_own_unapproved_schedules'
  ) then
    create policy calendar_items_org_update_own_unapproved_schedules
    on public.calendar_items
    for update
    to authenticated
    using (
      record_type = 'schedule'
      and schedule_source = 'organization'
      and created_by = auth.uid()
      and coalesce(approval_status, 'pending') <> 'approved'
    )
    with check (
      record_type = 'schedule'
      and schedule_source = 'organization'
      and created_by = auth.uid()
      and coalesce(approval_status, 'pending') <> 'approved'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'calendar_items'
      and policyname = 'calendar_items_org_delete_own_unapproved_schedules'
  ) then
    create policy calendar_items_org_delete_own_unapproved_schedules
    on public.calendar_items
    for delete
    to authenticated
    using (
      record_type = 'schedule'
      and schedule_source = 'organization'
      and created_by = auth.uid()
      and coalesce(approval_status, 'pending') <> 'approved'
    );
  end if;
end $$;
