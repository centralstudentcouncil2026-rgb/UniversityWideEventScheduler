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
  username text,
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('super_admin','organization_manager')),
  account_type text not null check (account_type in ('CSC','OIC','org')),
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  contact_number text check (contact_number is null or contact_number ~ '^[0-9]{11}$'),
  approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected')),
  is_enabled boolean not null default false,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_items (
  id text primary key,
  record_type text not null check (record_type in ('schedule','blocked_time','category')),
  organization_id uuid references public.organizations(id) on delete set null,
  category_id text, category_name text, category_color text, category_active boolean,
  title text, venue text, schedule_type text,
  start_time timestamptz, end_time timestamptz,
  occurrences jsonb not null default '[]'::jsonb,
  expected_attendees integer, privacy_level text,
  contact_person text, contact_info text, public_description text, purpose text,
  approval_status text, admin_recommendation text, approval_date timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  revision_of text, original_schedule_id text, revision_status text,
  revision_created_at timestamptz, revision_submitted_at timestamptz,
  revision_history jsonb not null default '[]'::jsonb,
  event_status text, block_type text, reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (
    (record_type = 'category' and category_name is not null)
    or (record_type = 'schedule' and title is not null and start_time is not null and end_time is not null)
    or (record_type = 'blocked_time' and title is not null and start_time is not null and end_time is not null)
  )
);
insert into public.calendar_items (id,record_type,category_id,category_name,category_color,category_active) values
  ('worship','category','worship','Worship','#2563EB',true),('gathering','category','gathering','Gathering','#16A34A',true),
  ('outreach','category','outreach','Outreach','#DC2626',true),('socialization','category','socialization','Socialization','#D97706',true),
  ('meeting','category','meeting','Meeting','#7C3AED',true),('others','category','others','Others','#64748B',true);

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

create index calendar_items_public_idx on public.calendar_items (record_type, approval_status, privacy_level, start_time);
create index calendar_items_org_idx on public.calendar_items (organization_id, created_by);
create index notifications_user_idx on public.notifications (user_id, is_read, created_at desc);

create or replace function public.is_enabled_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and is_enabled);
$$;

create or replace function public.approve_organization_profile(p_profile_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare profile_row public.profiles%rowtype; organization_uuid uuid;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision.'; end if;
  if not public.is_enabled_admin() then raise exception 'Admin access required.'; end if;
  select * into profile_row from public.profiles where id = p_profile_id for update;
  if not found or profile_row.role <> 'organization_manager' then raise exception 'Organization profile not found.'; end if;
  if p_decision = 'approved' then
    insert into public.organizations (organization_name) values (profile_row.organization_name)
    on conflict (organization_name) do update set updated_at = now()
    returning id into organization_uuid;
    update public.profiles
      set organization_id = organization_uuid, approval_status = 'approved', is_enabled = true,
          permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb, updated_at = now()
      where id = p_profile_id;
  else
    update public.profiles
      set approval_status = 'rejected', is_enabled = false,
          permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":false}'::jsonb, updated_at = now()
      where id = p_profile_id;
  end if;
end;
$$;

grant execute on function public.approve_organization_profile(uuid, text) to authenticated;

alter table public.profiles enable row level security;
drop policy if exists organization_signup_profile_insert on public.profiles;
create policy organization_signup_profile_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'organization_manager' and account_type = 'org' and approval_status = 'pending' and is_enabled = false);
drop policy if exists profiles_authenticated_select on public.profiles;
create policy profiles_authenticated_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_enabled_admin());

alter table public.calendar_items enable row level security;
create policy calendar_items_public_read on public.calendar_items
  for select to anon
  using (record_type in ('category','blocked_time') or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic'));
create policy calendar_items_authenticated_read on public.calendar_items
  for select to authenticated
  using (record_type in ('category','blocked_time') or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic') or created_by = auth.uid() or public.is_enabled_admin());
create policy calendar_items_authenticated_write on public.calendar_items
  for all to authenticated
  using (created_by = auth.uid() or public.is_enabled_admin())
  with check (
    (record_type = 'schedule' and (created_by = auth.uid() or public.is_enabled_admin()))
    or (record_type in ('blocked_time','category') and public.is_enabled_admin())
  );

grant select, insert, update, delete on all tables in schema public to anon, authenticated;

commit;
