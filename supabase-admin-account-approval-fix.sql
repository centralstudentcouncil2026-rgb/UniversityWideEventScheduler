-- Run once in the Supabase SQL Editor.
-- Installs the relational account-approval function used by the Admin dashboard.

begin;

alter table public.profiles add column if not exists organization_name text;
alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists is_enabled boolean not null default false;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.approve_organization_account(p_request_id uuid, p_decision text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.account_requests%rowtype;
  organization_uuid uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision.';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'super_admin' and is_enabled
  ) then
    raise exception 'Admin access required.';
  end if;

  select * into request_row
  from public.account_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Account request not found.';
  end if;

  if p_decision = 'approved' then
    insert into public.organizations (organization_name)
    values (request_row.organization_name)
    on conflict (organization_name) do update
      set updated_at = now()
    returning id into organization_uuid;

    insert into public.profiles (
      id, full_name, email, role, account_type, organization_id,
      organization_name, contact_number, approval_status, is_enabled, permissions
    )
    values (
      request_row.user_id, request_row.full_name, lower(request_row.aup_email),
      'organization_manager', 'org', organization_uuid,
      request_row.organization_name, request_row.contact_number,
      'approved', true, '{"enabled":true}'::jsonb
    )
    on conflict (id) do update
      set full_name = excluded.full_name,
          email = excluded.email,
          role = 'organization_manager',
          account_type = 'org',
          organization_id = excluded.organization_id,
          organization_name = excluded.organization_name,
          contact_number = excluded.contact_number,
          approval_status = 'approved',
          is_enabled = true,
          permissions = coalesce(profiles.permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb,
          updated_at = now();
  else
    update public.profiles
      set approval_status = 'rejected',
          is_enabled = false,
          permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":false}'::jsonb,
          updated_at = now()
    where id = request_row.user_id;
  end if;

  update public.account_requests
    set status = p_decision,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        updated_at = now()
  where id = p_request_id;
end;
$$;

grant execute on function public.approve_organization_account(uuid, text) to authenticated;

-- Repair any requests that were previously marked approved by the old client fallback.
insert into public.organizations (organization_name)
select distinct request_row.organization_name
from public.account_requests as request_row
where request_row.status = 'approved'
on conflict (organization_name) do update set updated_at = now();

update public.profiles as profile
set organization_id = organization.id,
    organization_name = request_row.organization_name,
    approval_status = 'approved',
    is_enabled = true,
    permissions = coalesce(profile.permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb,
    updated_at = now()
from public.account_requests as request_row
join public.organizations as organization
  on organization.organization_name = request_row.organization_name
where request_row.user_id = profile.id
  and request_row.status = 'approved';

commit;
