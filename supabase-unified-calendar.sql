-- CSC S.Y.N.C. unified calendar migration.
-- Run once in the Supabase SQL Editor after backing up the current project.
-- This removes account_requests, schedules, schedule_occurrences, blocked_times,
-- and schedule_categories after their records are copied into calendar_items.

begin;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists organization_name text;
alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists is_enabled boolean not null default false;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

create table if not exists public.activity_statuses (
  id text primary key,
  account_id uuid references auth.users(id) on delete set null,
  account_type text not null check (account_type in ('CSC', 'OIC')),
  activity_status text not null check (activity_status in (
    'Available in Office',
    'Not Available',
    'On Break',
    'In a Meeting',
    'Out for University Activity',
    'Available After an Hour',
    'Online Consultation Only'
  )),
  updated_by text,
  updated_at timestamptz not null default now()
);

-- Keep every existing organization request in profiles before retiring account_requests.
insert into public.profiles (
  id, full_name, email, role, account_type, organization_name,
  contact_number, approval_status, is_enabled, permissions
)
select
  request_row.user_id,
  request_row.full_name,
  lower(request_row.aup_email),
  'organization_manager',
  'org',
  request_row.organization_name,
  request_row.contact_number,
  request_row.status,
  false,
  '{"enabled":false}'::jsonb
from public.account_requests as request_row
where request_row.user_id is not null
on conflict (id) do update
  set full_name = excluded.full_name,
      email = excluded.email,
      role = 'organization_manager',
      account_type = 'org',
      organization_name = excluded.organization_name,
      contact_number = excluded.contact_number,
      approval_status = case
        when public.profiles.approval_status = 'approved' then 'approved'
        else excluded.approval_status
      end,
      updated_at = now();

drop table if exists public.calendar_items cascade;

create table public.calendar_items (
  id text primary key,
  record_type text not null check (record_type in ('schedule', 'blocked_time', 'category')),
  organization_id uuid references public.organizations(id) on delete set null,
  category_id text,
  category_name text,
  category_color text,
  category_active boolean,
  title text,
  venue text,
  schedule_type text,
  start_time timestamptz,
  end_time timestamptz,
  occurrences jsonb not null default '[]'::jsonb,
  expected_attendees integer,
  privacy_level text,
  contact_person text,
  contact_info text,
  public_description text,
  purpose text,
  approval_status text,
  admin_recommendation text,
  approval_date timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  revision_of text,
  original_schedule_id text,
  revision_status text,
  revision_created_at timestamptz,
  revision_submitted_at timestamptz,
  revision_history jsonb not null default '[]'::jsonb,
  event_status text,
  block_type text,
  reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (record_type = 'category' and category_name is not null)
    or (record_type = 'schedule' and title is not null and start_time is not null and end_time is not null)
    or (record_type = 'blocked_time' and title is not null and start_time is not null and end_time is not null)
  )
);

insert into public.calendar_items (
  id, record_type, category_id, category_name, category_color, category_active, created_at, updated_at
)
select id, 'category', id, name, color, active, now(), now()
from public.schedule_categories;

insert into public.calendar_items (
  id, record_type, organization_id, category_id, title, venue, schedule_type,
  start_time, end_time, occurrences, expected_attendees, privacy_level,
  contact_person, contact_info, public_description, purpose, approval_status,
  admin_recommendation, approval_date, reviewed_by, approved_by, revision_of,
  event_status, created_by, created_at, updated_at
)
select
  schedule.id::text,
  'schedule',
  schedule.organization_id,
  schedule.category_id,
  schedule.title,
  schedule.venue,
  case when exists (select 1 from public.schedule_occurrences as occurrence where occurrence.schedule_id = schedule.id) then 'multi_day' else 'single_day' end,
  schedule.start_time,
  schedule.end_time,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', occurrence.id::text,
      'date', occurrence.date,
      'start_time', occurrence.start_time,
      'end_time', occurrence.end_time
    ) order by occurrence.start_time)
    from public.schedule_occurrences as occurrence
    where occurrence.schedule_id = schedule.id
  ), '[]'::jsonb),
  schedule.expected_attendees,
  schedule.privacy_level,
  schedule.contact_person,
  schedule.contact_info,
  schedule.public_description,
  schedule.purpose,
  schedule.approval_status,
  schedule.admin_recommendation,
  schedule.approval_date,
  schedule.reviewed_by,
  schedule.approved_by,
  schedule.revision_of::text,
  schedule.event_status,
  schedule.created_by,
  schedule.created_at,
  schedule.updated_at
from public.schedules as schedule;

insert into public.calendar_items (
  id, record_type, title, block_type, start_time, end_time, reason,
  approval_status, event_status, created_by, created_at, updated_at
)
select
  blocked_time.id::text,
  'blocked_time',
  blocked_time.title,
  blocked_time.block_type,
  blocked_time.start_time,
  blocked_time.end_time,
  blocked_time.reason,
  'approved',
  'planned',
  blocked_time.created_by,
  blocked_time.created_at,
  blocked_time.updated_at
from public.blocked_times as blocked_time;

drop table public.schedule_occurrences;
drop table public.schedules;
drop table public.blocked_times;
drop table public.schedule_categories;
drop function if exists public.approve_organization_account(uuid, text);
drop table public.account_requests;

insert into public.organizations (organization_name)
select distinct profile.organization_name
from public.profiles as profile
where profile.role = 'organization_manager'
  and profile.approval_status = 'approved'
  and profile.organization_name is not null
  and profile.organization_name <> ''
on conflict (organization_name) do update set updated_at = now();

update public.profiles as profile
set organization_id = organization.id,
    is_enabled = true,
    permissions = coalesce(profile.permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb,
    updated_at = now()
from public.organizations as organization
where profile.role = 'organization_manager'
  and profile.approval_status = 'approved'
  and organization.organization_name = profile.organization_name;

create index calendar_items_type_start_idx on public.calendar_items (record_type, start_time);
create index calendar_items_schedule_visibility_idx on public.calendar_items (record_type, approval_status, privacy_level, start_time);
create index calendar_items_organization_idx on public.calendar_items (organization_id, created_by);

create or replace function public.is_enabled_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and is_enabled
  );
$$;

create or replace function public.approve_organization_profile(p_profile_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  profile_row public.profiles%rowtype;
  organization_uuid uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision.';
  end if;
  if not public.is_enabled_admin() then
    raise exception 'Admin access required.';
  end if;

  select * into profile_row from public.profiles where id = p_profile_id for update;
  if not found or profile_row.role <> 'organization_manager' then
    raise exception 'Organization profile not found.';
  end if;

  if p_decision = 'approved' then
    insert into public.organizations (organization_name)
    values (profile_row.organization_name)
    on conflict (organization_name) do update set updated_at = now()
    returning id into organization_uuid;

    update public.profiles
      set organization_id = organization_uuid,
          approval_status = 'approved',
          is_enabled = true,
          permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb,
          updated_at = now()
    where id = p_profile_id;
  else
    update public.profiles
      set approval_status = 'rejected',
          is_enabled = false,
          permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":false}'::jsonb,
          updated_at = now()
    where id = p_profile_id;
  end if;
end;
$$;

grant execute on function public.approve_organization_profile(uuid, text) to authenticated;

alter table public.calendar_items enable row level security;
alter table public.activity_statuses enable row level security;

drop policy if exists calendar_items_public_read on public.calendar_items;
create policy calendar_items_public_read on public.calendar_items
  for select to anon
  using (
    record_type in ('category', 'blocked_time')
    or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic')
  );

drop policy if exists calendar_items_authenticated_read on public.calendar_items;
create policy calendar_items_authenticated_read on public.calendar_items
  for select to authenticated
  using (
    record_type in ('category', 'blocked_time')
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
    or (record_type in ('blocked_time', 'category') and public.is_enabled_admin())
  );

grant select on public.calendar_items to anon, authenticated;
grant insert, update, delete on public.calendar_items to authenticated;

drop policy if exists activity_statuses_public_read on public.activity_statuses;
create policy activity_statuses_public_read on public.activity_statuses
  for select to anon
  using (true);

drop policy if exists activity_statuses_authenticated_read on public.activity_statuses;
create policy activity_statuses_authenticated_read on public.activity_statuses
  for select to authenticated
  using (true);

drop policy if exists activity_statuses_admin_write on public.activity_statuses;
create policy activity_statuses_admin_write on public.activity_statuses
  for all to authenticated
  using (
    public.is_enabled_admin()
    and (
      (account_type = 'CSC' and exists (select 1 from public.profiles where id = auth.uid() and lower(email) = 'cscadmin2@aup.edu.ph'))
      or (account_type = 'OIC' and exists (select 1 from public.profiles where id = auth.uid() and lower(email) = 'cscadmin1@aup.edu.ph'))
    )
  )
  with check (
    public.is_enabled_admin()
    and (
      (account_type = 'CSC' and exists (select 1 from public.profiles where id = auth.uid() and lower(email) = 'cscadmin2@aup.edu.ph'))
      or (account_type = 'OIC' and exists (select 1 from public.profiles where id = auth.uid() and lower(email) = 'cscadmin1@aup.edu.ph'))
    )
  );

grant select on public.activity_statuses to anon, authenticated;
grant insert, update, delete on public.activity_statuses to authenticated;
notify pgrst, 'reload schema';

commit;
