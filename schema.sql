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

-- Latest account display sync update
-- Run this when profile email/contact values exist in public.profiles but the
-- admin Accounts tab still shows blank values. It copies profile/auth contact
-- values into the browser-facing scheduler_state JSON users array.
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists contact_number text;
alter table if exists public.profiles add column if not exists phone_number text;

do $$
declare
  state_column text;
begin
  if to_regclass('public.scheduler_state') is null then
    return;
  end if;

  select column_name into state_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'scheduler_state'
    and data_type = 'jsonb'
    and column_name in ('state', 'store', 'data')
  order by case column_name when 'state' then 1 when 'store' then 2 else 3 end
  limit 1;

  if state_column is null or to_regclass('public.profiles') is null then
    return;
  end if;

  execute format(
    $sql$
      with profile_contacts as (
        select
          profile.id::text as id,
          lower(coalesce(nullif(profile.email, ''), auth_user.email, '')) as email,
          coalesce(nullif(profile.contact_number, ''), nullif(profile.phone_number, ''), '') as contact_number,
          lower(coalesce(nullif(profile.username, ''), '')) as username
        from public.profiles profile
        left join auth.users auth_user on auth_user.id = profile.id
      ),
      expanded_users as (
        select
          scheduler_state.ctid as row_id,
          coalesce(jsonb_agg(
            case
              when profile_contacts.id is null then user_item
              else user_item || jsonb_strip_nulls(jsonb_build_object(
                'email', nullif(profile_contacts.email, ''),
                'aup_email', case when profile_contacts.email like '%%@aup.edu.ph' then profile_contacts.email else null end,
                'contact_number', nullif(profile_contacts.contact_number, ''),
                'phone_number', nullif(profile_contacts.contact_number, '')
              ))
            end
          ), '[]'::jsonb) as users
        from public.scheduler_state scheduler_state
        cross join lateral jsonb_array_elements(coalesce(scheduler_state.%1$I->'users', '[]'::jsonb)) as user_item
        left join profile_contacts
          on profile_contacts.id = user_item->>'id'
          or profile_contacts.username = lower(coalesce(user_item->>'username', ''))
          or profile_contacts.email = lower(coalesce(user_item->>'email', ''))
          or profile_contacts.email = lower(coalesce(user_item->>'aup_email', ''))
        group by scheduler_state.ctid
      )
      update public.scheduler_state scheduler_state
      set %1$I = jsonb_set(scheduler_state.%1$I, '{users}', expanded_users.users, true)
      from expanded_users
      where scheduler_state.ctid = expanded_users.row_id
    $sql$,
    state_column
  );
end $$;

-- Cleanup for calendar schedules that still appear in scheduler_state but were
-- never saved into public.schedules. Upload this block when the calendar shows
-- old schedules that are missing from the schedules table.
do $$
declare
  state_column name;
begin
  if to_regclass('public.scheduler_state') is null
     or to_regclass('public.schedules') is null then
    return;
  end if;

  select column_name into state_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'scheduler_state'
    and data_type = 'jsonb'
    and column_name in ('state', 'store', 'data')
  order by case column_name when 'state' then 1 when 'store' then 2 else 3 end
  limit 1;

  if state_column is null then
    return;
  end if;

  execute format(
    $sql$
      with cleaned_state as (
        select
          scheduler_state.ctid as row_id,
          jsonb_set(
            scheduler_state.%1$I,
            '{events}',
            coalesce((
              select jsonb_agg(event_item)
              from jsonb_array_elements(coalesce(scheduler_state.%1$I->'events', '[]'::jsonb)) as event_item
              where coalesce(event_item->>'record_type', 'schedule') <> 'schedule'
                 or exists (
                   select 1
                   from public.schedules saved_schedule
                   where (event_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                     and saved_schedule.id = (event_item->>'id')::uuid
                 )
            ), '[]'::jsonb),
            true
          ) as next_state
        from public.scheduler_state scheduler_state
      )
      update public.scheduler_state scheduler_state
      set %1$I = cleaned_state.next_state
      from cleaned_state
      where scheduler_state.ctid = cleaned_state.row_id
        and scheduler_state.%1$I is distinct from cleaned_state.next_state
    $sql$,
    state_column
  );
end $$;

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
  revision_of uuid references public.schedules(id) on update cascade on delete cascade,
  original_schedule_id uuid references public.schedules(id) on update cascade on delete cascade,
  revision_status text check (revision_status in ('pending', 'approved', 'rejected')),
  revision_created_at timestamptz,
  revision_submitted_at timestamptz,
  revision_history jsonb not null default '[]'::jsonb,
  event_status text not null default 'planned',
  record_type text not null default 'schedule' check (record_type = 'schedule'),
  schedule_source text not null default 'organization' check (schedule_source in ('admin', 'organization')),
  created_by_role text not null default 'organization' check (created_by_role in ('admin', 'organization')),
  requires_approval boolean not null default true,
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedules_valid_time_range check (end_time > start_time)
);

-- Migration preflight: older schedules tables must receive new columns before
-- indexes, updates, or constraints reference them.
alter table if exists public.schedules add column if not exists admin_recommendation text;
alter table if exists public.schedules add column if not exists approval_date timestamptz;
alter table if exists public.schedules add column if not exists notification_status text;
alter table if exists public.schedules add column if not exists revision_of uuid references public.schedules(id) on update cascade on delete cascade;
alter table if exists public.schedules add column if not exists original_schedule_id uuid references public.schedules(id) on update cascade on delete cascade;
alter table if exists public.schedules add column if not exists revision_status text;
alter table if exists public.schedules add column if not exists revision_created_at timestamptz;
alter table if exists public.schedules add column if not exists revision_submitted_at timestamptz;
alter table if exists public.schedules add column if not exists revision_history jsonb not null default '[]'::jsonb;
alter table if exists public.schedules add column if not exists record_type text not null default 'schedule';
alter table if exists public.schedules add column if not exists schedule_source text not null default 'organization';
alter table if exists public.schedules add column if not exists created_by_role text not null default 'organization';
alter table if exists public.schedules add column if not exists requires_approval boolean not null default true;
alter table if exists public.schedules alter column approval_status set default 'pending';

update public.schedules
set record_type = 'schedule',
    schedule_source = case when approval_status = 'approved' and coalesce(requires_approval, true) = false then 'admin' else schedule_source end,
    created_by_role = case when schedule_source = 'admin' then 'admin' else 'organization' end,
    requires_approval = case when schedule_source = 'admin' then false else true end
where record_type is distinct from 'schedule'
   or schedule_source is null
   or created_by_role is null;

create index if not exists schedules_category_id_idx on public.schedules(category_id);
create index if not exists schedules_organization_id_idx on public.schedules(organization_id);
create index if not exists schedules_start_time_idx on public.schedules(start_time);
create index if not exists schedules_end_time_idx on public.schedules(end_time);
create index if not exists schedules_privacy_level_idx on public.schedules(privacy_level);
create index if not exists schedules_approval_status_idx on public.schedules(approval_status);
create index if not exists schedules_approval_date_idx on public.schedules(approval_date);
create index if not exists schedules_notification_status_idx on public.schedules(notification_status);
create index if not exists schedules_revision_of_idx on public.schedules(revision_of);
create index if not exists schedules_original_schedule_id_idx on public.schedules(original_schedule_id);
create index if not exists schedules_revision_status_idx on public.schedules(revision_status);
create index if not exists schedules_record_type_idx on public.schedules(record_type);
create index if not exists schedules_schedule_source_idx on public.schedules(schedule_source);
create index if not exists schedules_requires_approval_idx on public.schedules(requires_approval);

alter table if exists public.schedules add column if not exists admin_recommendation text;
alter table if exists public.schedules add column if not exists approval_date timestamptz;
alter table if exists public.schedules add column if not exists notification_status text;
alter table if exists public.schedules add column if not exists revision_of uuid references public.schedules(id) on update cascade on delete cascade;
alter table if exists public.schedules add column if not exists original_schedule_id uuid references public.schedules(id) on update cascade on delete cascade;
alter table if exists public.schedules add column if not exists revision_status text;
alter table if exists public.schedules add column if not exists revision_created_at timestamptz;
alter table if exists public.schedules add column if not exists revision_submitted_at timestamptz;
alter table if exists public.schedules add column if not exists revision_history jsonb not null default '[]'::jsonb;
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
    alter table public.schedules drop constraint if exists schedules_revision_status_check;
    alter table public.schedules
      add constraint schedules_revision_status_check check (revision_status is null or revision_status in ('pending', 'approved', 'rejected'));
    alter table public.schedules drop constraint if exists schedules_record_type_check;
    alter table public.schedules
      add constraint schedules_record_type_check check (record_type = 'schedule');
    alter table public.schedules drop constraint if exists schedules_schedule_source_check;
    alter table public.schedules
      add constraint schedules_schedule_source_check check (schedule_source in ('admin', 'organization'));
    alter table public.schedules drop constraint if exists schedules_created_by_role_check;
    alter table public.schedules
      add constraint schedules_created_by_role_check check (created_by_role in ('admin', 'organization'));
    alter table public.schedules drop constraint if exists schedules_admin_approval_check;
    alter table public.schedules
      add constraint schedules_admin_approval_check check (
        schedule_source <> 'admin'
        or (requires_approval = false and approval_status = 'approved')
      );
  end if;
end $$;

create table if not exists public.schedule_occurrences (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on update cascade on delete cascade,
  date date not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  created_at timestamptz not null default now(),
  constraint schedule_occurrences_valid_time_range check (end_time > start_time)
);

create index if not exists schedule_occurrences_schedule_id_idx on public.schedule_occurrences(schedule_id);
create index if not exists schedule_occurrences_date_idx on public.schedule_occurrences(date);
create index if not exists schedule_occurrences_start_time_idx on public.schedule_occurrences(start_time);

grant select, insert, update, delete on public.schedule_organizations to authenticated;
grant select, insert, update, delete on public.schedules to authenticated;
grant select, insert, update, delete on public.schedule_occurrences to authenticated;
grant select on public.schedule_organizations, public.schedules, public.schedule_occurrences to anon;

create table if not exists public.schedule_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on update cascade on delete cascade,
  proposed_schedule jsonb not null,
  revision_approval_status text not null default 'pending' check (revision_approval_status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references auth.users(id) on update cascade on delete set null,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on update cascade on delete set null,
  reviewed_at timestamptz,
  revision_history jsonb not null default '[]'::jsonb
);

create index if not exists schedule_revisions_schedule_id_idx on public.schedule_revisions(schedule_id);
create index if not exists schedule_revisions_status_idx on public.schedule_revisions(revision_approval_status);
create index if not exists schedule_revisions_submitted_at_idx on public.schedule_revisions(submitted_at);

create table if not exists public.blocked_times (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  block_type text not null check (block_type in ('single_day', 'multi_day')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text,
  record_type text not null default 'blocked_time' check (record_type = 'blocked_time'),
  block_source text not null default 'admin' check (block_source = 'admin'),
  created_by_role text not null default 'admin' check (created_by_role = 'admin'),
  requires_approval boolean not null default false,
  created_by uuid references auth.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_times_valid_time_range check (end_time > start_time),
  constraint blocked_times_reason_length check (reason is null or char_length(reason) <= 500)
);

create index if not exists blocked_times_block_type_idx on public.blocked_times(block_type);
create index if not exists blocked_times_start_time_idx on public.blocked_times(start_time);
create index if not exists blocked_times_end_time_idx on public.blocked_times(end_time);
create index if not exists blocked_times_created_by_idx on public.blocked_times(created_by);

grant select, insert, update, delete on public.blocked_times to authenticated;
grant select on public.blocked_times to anon;

alter table if exists public.blocked_times enable row level security;
drop policy if exists blocked_times_public_select on public.blocked_times;
create policy blocked_times_public_select
  on public.blocked_times
  for select
  to anon, authenticated
  using (true);

do $$
declare
  state_column name;
begin
  if to_regclass('public.scheduler_state') is null
     or to_regclass('public.blocked_times') is null then
    return;
  end if;

  select column_name into state_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'scheduler_state'
    and data_type = 'jsonb'
    and column_name in ('state', 'store', 'data')
  order by case column_name when 'state' then 1 when 'store' then 2 else 3 end
  limit 1;

  if state_column is null then
    return;
  end if;

  execute format(
    $sql$
      with json_blocks as (
        select block_item
        from public.scheduler_state scheduler_state
        cross join lateral jsonb_array_elements(coalesce(scheduler_state.%1$I->'blockedTimes', '[]'::jsonb)) as block_item
      ),
      normalized_blocks as (
        select
          case
            when block_item->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (block_item->>'id')::uuid
            else (
              substr(md5(coalesce(block_item->>'id', block_item->>'title', '') || coalesce(block_item->>'start_time', '')), 1, 8) || '-' ||
              substr(md5(coalesce(block_item->>'id', block_item->>'title', '') || coalesce(block_item->>'start_time', '')), 9, 4) || '-4' ||
              substr(md5(coalesce(block_item->>'id', block_item->>'title', '') || coalesce(block_item->>'start_time', '')), 14, 3) || '-8' ||
              substr(md5(coalesce(block_item->>'id', block_item->>'title', '') || coalesce(block_item->>'start_time', '')), 18, 3) || '-' ||
              substr(md5(coalesce(block_item->>'id', block_item->>'title', '') || coalesce(block_item->>'start_time', '')), 21, 12)
            )::uuid
          end as id,
          coalesce(nullif(block_item->>'title', ''), 'Blocked university period') as title,
          case when block_item->>'block_type' in ('single_day', 'multi_day') then block_item->>'block_type' else 'single_day' end as block_type,
          (block_item->>'start_time')::timestamptz as start_time,
          (block_item->>'end_time')::timestamptz as end_time,
          nullif(block_item->>'reason', '') as reason,
          case
            when block_item->>'created_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then (block_item->>'created_by')::uuid
            else null
          end as created_by,
          coalesce(nullif(block_item->>'created_at', '')::timestamptz, now()) as created_at,
          coalesce(nullif(block_item->>'updated_at', '')::timestamptz, now()) as updated_at
        from json_blocks
        where block_item ? 'start_time'
          and block_item ? 'end_time'
          and block_item->>'start_time' <> ''
          and block_item->>'end_time' <> ''
      )
      insert into public.blocked_times (
        id,
        title,
        block_type,
        start_time,
        end_time,
        reason,
        record_type,
        block_source,
        created_by_role,
        requires_approval,
        created_by,
        created_at,
        updated_at
      )
      select
        id,
        title,
        block_type,
        start_time,
        end_time,
        reason,
        'blocked_time',
        'admin',
        'admin',
        false,
        created_by,
        created_at,
        updated_at
      from normalized_blocks
      where end_time > start_time
      on conflict (id) do update
      set title = excluded.title,
          block_type = excluded.block_type,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          reason = excluded.reason,
          record_type = 'blocked_time',
          block_source = 'admin',
          created_by_role = 'admin',
          requires_approval = false,
          updated_at = excluded.updated_at
    $sql$,
    state_column
  );
end $$;

-- Migration/update helpers for an existing blocked_times table.
alter table if exists public.blocked_times add column if not exists block_type text;
alter table if exists public.blocked_times add column if not exists created_by uuid references auth.users(id) on update cascade on delete set null;
alter table if exists public.blocked_times add column if not exists created_at timestamptz not null default now();
alter table if exists public.blocked_times add column if not exists updated_at timestamptz not null default now();
alter table if exists public.blocked_times add column if not exists record_type text not null default 'blocked_time';
alter table if exists public.blocked_times add column if not exists block_source text not null default 'admin';
alter table if exists public.blocked_times add column if not exists created_by_role text not null default 'admin';
alter table if exists public.blocked_times add column if not exists requires_approval boolean not null default false;

update public.blocked_times
set block_type = case
  when block_type is not null then block_type
  when start_time::date = end_time::date then 'single_day'
  else 'multi_day'
end
where block_type is null;

update public.blocked_times
set record_type = 'blocked_time',
    block_source = 'admin',
    created_by_role = 'admin',
    requires_approval = false,
    updated_at = coalesce(updated_at, created_at, now())
where record_type is distinct from 'blocked_time'
   or block_source is distinct from 'admin'
   or created_by_role is distinct from 'admin'
   or requires_approval is distinct from false;

do $$
begin
  if to_regclass('public.blocked_times') is not null then
    alter table public.blocked_times drop constraint if exists blocked_times_record_type_check;
    alter table public.blocked_times
      add constraint blocked_times_record_type_check check (record_type = 'blocked_time');
    alter table public.blocked_times drop constraint if exists blocked_times_block_source_check;
    alter table public.blocked_times
      add constraint blocked_times_block_source_check check (block_source = 'admin');
    alter table public.blocked_times drop constraint if exists blocked_times_created_by_role_check;
    alter table public.blocked_times
      add constraint blocked_times_created_by_role_check check (created_by_role = 'admin');
    alter table public.blocked_times drop constraint if exists blocked_times_requires_approval_check;
    alter table public.blocked_times
      add constraint blocked_times_requires_approval_check check (requires_approval = false);
  end if;
end $$;

create index if not exists blocked_times_record_type_idx on public.blocked_times(record_type);
create index if not exists blocked_times_block_source_idx on public.blocked_times(block_source);
create index if not exists blocked_times_requires_approval_idx on public.blocked_times(requires_approval);

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

grant select on public.profiles to authenticated;
alter table if exists public.profiles enable row level security;
drop policy if exists profiles_authenticated_select on public.profiles;
create policy profiles_authenticated_select
  on public.profiles
  for select
  to authenticated
  using (true);

create table if not exists public.account_requests (
  id uuid primary key default gen_random_uuid(),
  username text,
  full_name text,
  requested_role text default 'organization_manager',
  organization_name text,
  status text not null default 'pending',
  aup_email text,
  email text,
  phone_number text,
  contact_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.account_requests add column if not exists username text;
alter table if exists public.account_requests add column if not exists full_name text;
alter table if exists public.account_requests add column if not exists requested_role text default 'organization_manager';
alter table if exists public.account_requests add column if not exists organization_name text;
alter table if exists public.account_requests add column if not exists status text not null default 'pending';
alter table if exists public.account_requests add column if not exists aup_email text;
alter table if exists public.account_requests add column if not exists email text;
alter table if exists public.account_requests add column if not exists phone_number text;
alter table if exists public.account_requests add column if not exists contact_number text;
alter table if exists public.account_requests add column if not exists created_at timestamptz not null default now();
alter table if exists public.account_requests add column if not exists updated_at timestamptz not null default now();

create index if not exists account_requests_status_idx on public.account_requests(status);
create index if not exists account_requests_aup_email_idx on public.account_requests(aup_email);
create index if not exists account_requests_phone_number_idx on public.account_requests(phone_number);

alter table public.account_requests enable row level security;

drop policy if exists account_requests_insert_public on public.account_requests;
drop policy if exists account_requests_select_admin on public.account_requests;
drop policy if exists account_requests_update_admin on public.account_requests;
drop policy if exists account_requests_delete_admin on public.account_requests;

create policy account_requests_insert_public
  on public.account_requests
  for insert
  to anon, authenticated
  with check (true);

create policy account_requests_select_admin
  on public.account_requests
  for select
  to authenticated
  using (true);

create policy account_requests_update_admin
  on public.account_requests
  for update
  to authenticated
  using (true)
  with check (true);

create policy account_requests_delete_admin
  on public.account_requests
  for delete
  to authenticated
  using (true);

grant select, insert, update on public.account_requests to anon, authenticated;
grant delete on public.account_requests to authenticated;

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

-- Admin access lockdown
-- Run this in Supabase SQL after the base CONNECT schema exists. It keeps only
-- these admin dashboard accounts. Before running the DO block, set the admin
-- seed password for the current SQL session with:
--   select set_config('app.admin_seed_password', '<admin-password>', false);
--
-- To reset the four CSC admin passwords, run this before the DO block in the
-- Supabase SQL editor with the password value you want to seed:
--   select set_config('app.admin_seed_password', '<admin-password>', false);

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.profiles add column if not exists username text;
alter table if exists public.profiles add column if not exists full_name text;
alter table if exists public.profiles add column if not exists role text;
alter table if exists public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table if exists public.profiles add column if not exists account_preset text;
alter table if exists public.profiles add column if not exists account_type text;
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();
alter table if exists public.profiles add column if not exists created_at timestamptz not null default now();

do $$
declare
  admin_email text;
  admin_number text;
  admin_password text := current_setting('app.admin_seed_password', true);
  admin_user_id uuid;
  identity_id_type text;
  replacement_admin_id uuid;
  allowed_admins text[] := array[
    'cscadmin1@aup.edu.ph',
    'cscadmin2@aup.edu.ph',
    'cscadmin3@aup.edu.ph',
    'cscadmin4@aup.edu.ph'
  ];
  manager_permissions jsonb := jsonb_build_object(
    'enabled', true,
    'manageAccounts', true,
    'approveEvents', true,
    'editAllEvents', true,
    'deleteAllEvents', true,
    'manageBlockedTimes', true,
    'manageAnnouncements', true,
    'updatePresidentStatus', true,
    'updateOfficeStatus', true,
    'manageCategories', true
  );
begin
  if coalesce(admin_password, '') = '' then
    raise exception 'Set app.admin_seed_password before running the admin access lockdown SQL.';
  end if;

  foreach admin_email in array allowed_admins loop
    admin_number := substring(admin_email from 'cscadmin([0-9]+)@aup\.edu\.ph');
    select id into admin_user_id
    from auth.users
    where lower(email) = admin_email
    limit 1;

    if admin_user_id is null then
      admin_user_id := gen_random_uuid();
      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
      )
      values (
        '00000000-0000-0000-0000-000000000000',
        admin_user_id,
        'authenticated',
        'authenticated',
        admin_email,
        extensions.crypt(admin_password, extensions.gen_salt('bf')),
        now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('full_name', 'CSC Admin ' || admin_number),
        now(),
        now(),
        '',
        '',
        '',
        ''
      );
    else
      update auth.users
      set encrypted_password = extensions.crypt(admin_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_app_meta_data = jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'CSC Admin ' || admin_number),
          updated_at = now()
      where id = admin_user_id;
    end if;

    if to_regclass('auth.identities') is not null then
      select data_type into identity_id_type
      from information_schema.columns
      where table_schema = 'auth'
        and table_name = 'identities'
        and column_name = 'id'
      limit 1;

      delete from auth.identities
      where provider = 'email'
        and (
          user_id = admin_user_id
          or lower(coalesce(identity_data->>'email', '')) = admin_email
        );

      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'auth'
          and table_name = 'identities'
          and column_name = 'provider_id'
      ) then
        if identity_id_type = 'uuid' then
          execute
            'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1, $2, $3, $4, $5, now(), now(), now())'
          using
            admin_user_id,
            admin_user_id,
            admin_email,
            jsonb_build_object('sub', admin_user_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
            'email';
        else
          execute
            'insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1, $2, $3, $4, $5, now(), now(), now())'
          using
            admin_user_id::text,
            admin_user_id,
            admin_email,
            jsonb_build_object('sub', admin_user_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
            'email';
        end if;
      else
        if identity_id_type = 'uuid' then
          execute
            'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1, $2, $3, $4, now(), now(), now())'
          using
            admin_user_id,
            admin_user_id,
            jsonb_build_object('sub', admin_user_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
            'email';
        else
          execute
            'insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
             values ($1, $2, $3, $4, now(), now(), now())'
          using
            admin_user_id::text,
            admin_user_id,
            jsonb_build_object('sub', admin_user_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
            'email';
        end if;
      end if;
    end if;

    insert into public.profiles (
      id,
      username,
      full_name,
      role,
      permissions,
      account_preset,
      account_type,
      email,
      suspension_status,
      created_at,
      updated_at
    )
    values (
      admin_user_id,
      admin_email,
      'CSC Admin ' || admin_number,
      'super_admin',
      manager_permissions,
      'manager',
      'CSC',
      admin_email,
      false,
      now(),
      now()
    )
    on conflict (id) do update
    set username = excluded.username,
        full_name = excluded.full_name,
        role = excluded.role,
        permissions = excluded.permissions,
        account_preset = excluded.account_preset,
        account_type = excluded.account_type,
        email = excluded.email,
        suspension_status = false,
        suspension_date = null,
        updated_at = now();
  end loop;

  select id into replacement_admin_id
  from auth.users
  where lower(email) = allowed_admins[1]
  limit 1;

  if replacement_admin_id is not null
     and to_regclass('public.scheduler_state') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'scheduler_state'
         and column_name = 'updated_by'
     ) then
    update public.scheduler_state
    set updated_by = replacement_admin_id
    where updated_by in (
      select profile.id
      from public.profiles profile
      left join auth.users auth_user on auth_user.id = profile.id
      where profile.role = 'super_admin'
        and lower(coalesce(profile.email, profile.username, auth_user.email, '')) <> all (allowed_admins)
    );
  end if;

  delete from auth.users auth_user
  using public.profiles profile
  where auth_user.id = profile.id
    and profile.role = 'super_admin'
    and lower(coalesce(profile.email, profile.username, auth_user.email, '')) <> all (allowed_admins);

  delete from public.profiles
  where role = 'super_admin'
    and lower(coalesce(email, username, '')) <> all (allowed_admins);
end $$;

do $$
declare
  state_column name;
  allowed_admins text[] := array[
    'cscadmin1@aup.edu.ph',
    'cscadmin2@aup.edu.ph',
    'cscadmin3@aup.edu.ph',
    'cscadmin4@aup.edu.ph'
  ];
  manager_permissions jsonb := jsonb_build_object(
    'enabled', true,
    'manageAccounts', true,
    'approveEvents', true,
    'editAllEvents', true,
    'deleteAllEvents', true,
    'manageBlockedTimes', true,
    'manageAnnouncements', true,
    'updatePresidentStatus', true,
    'updateOfficeStatus', true,
    'manageCategories', true
  );
begin
  if to_regclass('public.scheduler_state') is null then
    return;
  end if;

  select column_name into state_column
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'scheduler_state'
    and data_type = 'jsonb'
    and column_name in ('state', 'store', 'data')
  order by case column_name when 'state' then 1 when 'store' then 2 else 3 end
  limit 1;

  if state_column is null then
    return;
  end if;

  execute format(
    $sql$
      with allowed_admin_users as (
        select jsonb_agg(jsonb_build_object(
          'id', auth_user.id::text,
          'username', lower(auth_user.email),
          'email', lower(auth_user.email),
          'full_name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', 'CSC Admin'),
          'role', 'super_admin',
          'account_preset', 'manager',
          'account_type', 'CSC',
          'permissions', $2,
          'suspension_status', false,
          'suspended_status', false,
          'created_at', coalesce(profile.created_at, auth_user.created_at, now()),
          'updated_at', now()
        )) as users
        from auth.users auth_user
        left join public.profiles profile on profile.id = auth_user.id
        where lower(auth_user.email) = any ($1)
      ),
      current_non_admin_users as (
        select coalesce(jsonb_agg(user_item), '[]'::jsonb) as users
        from jsonb_array_elements(coalesce((select %1$I from public.scheduler_state limit 1)->'users', '[]'::jsonb)) as user_item
        where coalesce(user_item->>'role', '') <> 'super_admin'
      )
      update public.scheduler_state
      set %1$I = jsonb_set(
        %1$I,
        '{users}',
        (select current_non_admin_users.users || coalesce(allowed_admin_users.users, '[]'::jsonb)
         from current_non_admin_users, allowed_admin_users),
        true
      )
      where %1$I ? 'users'
    $sql$,
    state_column
  ) using allowed_admins, manager_permissions;
end $$;
