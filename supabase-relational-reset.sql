-- CSC S.Y.N.C. RELATIONAL RESET
-- Use only on the new Supabase project. It never writes to auth.users.

begin;

drop schema if exists public cascade;
create schema public;
grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

create extension if not exists pgcrypto with schema extensions;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null unique,
  organization_type text not null default 'Student Organization',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('super_admin','organization_manager')),
  account_type text not null check (account_type in ('CSC','OIC','org')),
  organization_id uuid references public.organizations(id) on delete set null,
  contact_number text check (contact_number is null or contact_number ~ '^[0-9]{11}$'),
  is_enabled boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.account_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  full_name text not null,
  aup_email text not null unique check (aup_email ~* '^[^@]+@aup\\.edu\\.ph$'),
  contact_number text not null check (contact_number ~ '^[0-9]{11}$'),
  organization_name text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.schedule_categories (
  id text primary key,
  name text not null unique,
  color text not null,
  active boolean not null default true
);
insert into public.schedule_categories (id,name,color) values
  ('worship','Worship','#2563EB'),('gathering','Gathering','#16A34A'),
  ('outreach','Outreach','#DC2626'),('socialization','Socialization','#D97706'),
  ('meeting','Meeting','#7C3AED'),('others','Others','#64748B');

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  category_id text not null references public.schedule_categories(id),
  title text not null, venue text not null,
  start_time timestamptz not null, end_time timestamptz not null check (end_time > start_time),
  expected_attendees integer not null check (expected_attendees >= 1),
  privacy_level text not null check (privacy_level in ('basic','internal')),
  contact_person text not null, contact_info text not null check (contact_info ~ '^[0-9]{11}$'),
  public_description text not null, purpose text not null,
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  admin_recommendation text, approval_date timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  revision_of uuid references public.schedules(id) on delete cascade,
  event_status text not null default 'planned' check (event_status in ('planned','cancelled','disabled','completed')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  date date not null, start_time timestamptz not null, end_time timestamptz not null check (end_time > start_time)
);

create table public.blocked_times (
  id uuid primary key default gen_random_uuid(), title text not null,
  block_type text not null check (block_type in ('single_day','whole_day','multi_day')),
  start_time timestamptz not null, end_time timestamptz not null check (end_time > start_time),
  reason text, created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(), title text not null, content text not null,
  visibility_status text not null default 'show' check (visibility_status in ('show','hidden')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null, reference_id uuid, title text not null, message text not null,
  is_read boolean not null default false, created_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  action text not null, previous_values jsonb, new_values jsonb, created_at timestamptz not null default now()
);

create index schedules_public_idx on public.schedules (approval_status, privacy_level, start_time);
create index schedules_org_idx on public.schedules (organization_id, created_by);
create index occurrences_schedule_idx on public.schedule_occurrences (schedule_id, date);
create index blocks_time_idx on public.blocked_times (start_time, end_time);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

grant select, insert, update, delete on all tables in schema public to anon, authenticated;

commit;
