-- CONNECT Supabase backend
-- Applied to Supabase project: lcmyqhyxtipzovmgbdtf
--
-- Migration names:
--   20260606071206_create_connect_json_backend_schema
--   20260606071433_fix_connect_auth_user_defaults
--   20260606071809_tighten_connect_rpc_grants
--   20260606072919_fix_account_request_pgcrypto_schema
--   harden_connect_store_permissions
--   fix_connect_status_permission_array_append
--   tighten_connect_helper_rpc_grants
--
-- The live backend uses Supabase Auth for login and a compact JSON scheduler
-- state table for the browser-facing CONNECT store:
--
--   auth.users
--     -> public.profiles
--
--   public.scheduler_state
--
-- Browser clients use these RPCs:
--
--   public.create_scheduler_account(...)
--   public.apply_account_request_decision(...)
--   public.get_scheduler_store()
--   public.save_scheduler_store(jsonb)
--   public.delete_scheduler_record(text, text)
--
-- Public viewers can call get_scheduler_store() without an account. New
-- accounts are created in Supabase Auth with pending profiles and pending
-- account request entries in scheduler_state. Only an active super-admin can
-- approve access requests. Authenticated save and delete calls require an
-- active CONNECT profile and enforce CONNECT account permission toggles on
-- the server. Public and organization reads are filtered by the RPC before
-- they reach the browser.
--
-- The authoritative SQL is stored in the Supabase migration history for
-- project lcmyqhyxtipzovmgbdtf.

-- Admin dashboard schedule module migration reference
-- Apply in Supabase when moving from the compact JSON store to relational
-- schedule tables, or use the constraints below inside save_scheduler_store()
-- if keeping scheduler_state as the authoritative table.

create table if not exists public.schedule_categories (
  id text primary key,
  name text not null unique,
  color text not null default '#64748B',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_categories_allowed_name check (
    name in ('Worship', 'Gathering', 'Outreach', 'Socialization', 'Meeting', 'Others')
  )
);

insert into public.schedule_categories (id, name, color)
values
  ('worship', 'Worship', '#2563EB'),
  ('gathering', 'Gathering', '#16A34A'),
  ('outreach', 'Outreach', '#DC2626'),
  ('socialization', 'Socialization', '#D97706'),
  ('meeting', 'Meeting', '#7C3AED'),
  ('others', 'Others', '#64748B')
on conflict (id) do update
set name = excluded.name,
    color = excluded.color,
    active = true,
    updated_at = now();

create table if not exists public.schedule_organizations (
  id text primary key,
  organization_name text not null unique,
  organization_type text not null default 'Organization',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id text references public.schedule_organizations(id) on update cascade on delete set null,
  category_id text not null references public.schedule_categories(id),
  title text not null,
  venue text not null,
  schedule_type text not null check (schedule_type in ('single_day', 'multi_day')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  expected_attendees integer not null check (expected_attendees >= 1),
  privacy_level text not null check (privacy_level in ('basic', 'internal')),
  contact_person text not null,
  contact_info text not null check (contact_info ~ '^[0-9]{11}$'),
  public_description text not null,
  purpose text not null,
  schedule_schema_version integer not null default 2,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  admin_recommendation text,
  approval_date timestamptz,
  notification_status text check (notification_status in ('unread', 'read')),
  event_status text not null default 'planned',
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_valid_time_range check (end_time > start_time)
);

create index if not exists schedules_category_id_idx on public.schedules(category_id);
create index if not exists schedules_organization_id_idx on public.schedules(organization_id);
create index if not exists schedules_start_time_idx on public.schedules(start_time);
create index if not exists schedules_end_time_idx on public.schedules(end_time);
create index if not exists schedules_privacy_level_idx on public.schedules(privacy_level);
create index if not exists schedules_approval_status_idx on public.schedules(approval_status);
create index if not exists schedules_approval_date_idx on public.schedules(approval_date);
create index if not exists schedules_notification_status_idx on public.schedules(notification_status);

alter table if exists public.schedules add column if not exists admin_recommendation text;
alter table if exists public.schedules add column if not exists approval_date timestamptz;
alter table if exists public.schedules add column if not exists notification_status text;
alter table if exists public.schedules alter column approval_status set default 'pending';

update public.schedules
set notification_status = 'unread'
where approval_date is not null
  and notification_status is null;

do $$
begin
  if to_regclass('public.schedules') is not null then
    alter table public.schedules drop constraint if exists schedules_approval_status_check;
    alter table public.schedules
      add constraint schedules_approval_status_check check (approval_status in ('pending', 'approved', 'rejected'));
    alter table public.schedules drop constraint if exists schedules_notification_status_check;
    alter table public.schedules
      add constraint schedules_notification_status_check check (notification_status is null or notification_status in ('unread', 'read'));
  end if;
end $$;

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  block_type text not null check (block_type in ('single_day', 'multi_day')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  constraint blocked_times_valid_time_range check (end_time > start_time),
  constraint blocked_times_reason_length check (reason is null or char_length(reason) <= 500)
);

create index if not exists blocked_times_block_type_idx on public.blocked_times(block_type);
create index if not exists blocked_times_start_time_idx on public.blocked_times(start_time);
create index if not exists blocked_times_end_time_idx on public.blocked_times(end_time);
create index if not exists blocked_times_created_by_idx on public.blocked_times(created_by);

-- Migration/update helpers for an existing blocked_times table.
alter table if exists public.blocked_times add column if not exists block_type text;
alter table if exists public.blocked_times add column if not exists created_by uuid references auth.users(id) on update cascade on delete set null;
alter table if exists public.blocked_times add column if not exists created_at timestamptz not null default now();

update public.blocked_times
set block_type = case
  when block_type is not null then block_type
  when start_time::date = end_time::date then 'single_day'
  else 'multi_day'
end
where block_type is null;

alter table if exists public.profiles add column if not exists account_type text;
alter table if exists public.profiles add column if not exists contact_number text;
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists suspension_status boolean not null default false;
alter table if exists public.profiles add column if not exists suspension_date timestamptz;
alter table if exists public.profiles add column if not exists deletion_logs jsonb not null default '[]'::jsonb;
alter table if exists public.profiles add column if not exists modification_logs jsonb not null default '[]'::jsonb;
do $$
begin
  if to_regclass('public.profiles') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'profiles_account_type_allowed'
         and conrelid = 'public.profiles'::regclass
     ) then
    alter table public.profiles
      add constraint profiles_account_type_allowed check (account_type in ('CSC', 'OIC'));
  end if;
end $$;

update public.profiles
set account_type = case
  when account_type is not null then account_type
  when role = 'organization_manager' then 'OIC'
  else 'CSC'
end
where account_type is null;

create index if not exists profiles_suspension_status_idx on public.profiles(suspension_status);
create index if not exists profiles_suspension_date_idx on public.profiles(suspension_date);

create table if not exists public.activity_statuses (
  account_id uuid primary key references auth.users(id) on update cascade on delete cascade,
  account_type text not null check (account_type in ('CSC', 'OIC')),
  activity_status text not null check (
    activity_status in (
      'Available in Office',
      'Not Available',
      'On Break',
      'In a Meeting',
      'Out for University Activity',
      'Available After an Hour',
      'Online Consultation Only'
    )
  ),
  updated_at timestamptz not null default now()
);

create index if not exists activity_statuses_account_type_idx on public.activity_statuses(account_type);
create index if not exists activity_statuses_updated_at_idx on public.activity_statuses(updated_at);

-- Upsert pattern used by status updates in relational deployments:
-- insert into public.activity_statuses (account_id, account_type, activity_status, updated_at)
-- values ('00000000-0000-0000-0000-000000000000', 'CSC', 'Available in Office', now())
-- on conflict (account_id) do update
-- set account_type = excluded.account_type,
--     activity_status = excluded.activity_status,
--     updated_at = excluded.updated_at;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  visibility_status text not null default 'show' check (visibility_status in ('show', 'hidden')),
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_visibility_status_idx on public.announcements(visibility_status);
create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists announcements_updated_at_idx on public.announcements(updated_at);

alter table if exists public.announcements add column if not exists visibility_status text not null default 'show';
alter table if exists public.announcements add column if not exists created_by uuid references auth.users(id) on update cascade on delete set null;
alter table if exists public.announcements add column if not exists created_at timestamptz not null default now();
alter table if exists public.announcements add column if not exists updated_at timestamptz not null default now();
alter table if exists public.announcements drop column if exists priority;
alter table if exists public.announcements drop column if exists expires_at;

update public.announcements
set visibility_status = 'show'
where visibility_status is null;

do $$
begin
  if to_regclass('public.announcements') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'announcements_visibility_status_allowed'
         and conrelid = 'public.announcements'::regclass
     ) then
    alter table public.announcements
      add constraint announcements_visibility_status_allowed check (visibility_status in ('show', 'hidden'));
  end if;
end $$;

create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on update cascade on delete cascade,
  notification_type text not null,
  reference_id text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists notifications_is_read_idx on public.notifications(is_read);
create index if not exists notifications_type_idx on public.notifications(notification_type);
create index if not exists notifications_reference_id_idx on public.notifications(reference_id);
create index if not exists notifications_created_at_idx on public.notifications(created_at);
