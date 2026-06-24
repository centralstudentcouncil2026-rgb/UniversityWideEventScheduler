-- Relational organization signup and Admin approval workflow.

alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved','rejected'));
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists organization_name text;
alter table public.profiles add column if not exists contact_number text;
alter table public.profiles add column if not exists account_type text;
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists is_enabled boolean not null default false;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

update public.profiles
set approval_status = case when role = 'organization_manager' and not is_enabled then 'pending' else 'approved' end
where approval_status is null;

alter table public.profiles enable row level security;
alter table public.account_requests enable row level security;

create or replace function public.is_enabled_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and is_enabled);
$$;
grant execute on function public.is_enabled_admin() to authenticated;

drop policy if exists organization_signup_profile_insert on public.profiles;
create policy organization_signup_profile_insert on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'organization_manager' and account_type = 'org' and approval_status = 'pending' and is_enabled = false);

drop policy if exists profiles_authenticated_select on public.profiles;
create policy profiles_authenticated_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_enabled_admin());

drop policy if exists organization_signup_request_insert on public.account_requests;
create policy organization_signup_request_insert on public.account_requests
  for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists account_requests_authenticated_select on public.account_requests;
create policy account_requests_authenticated_select on public.account_requests
  for select to authenticated
  using (user_id = auth.uid() or public.is_enabled_admin());

drop trigger if exists organization_signup_records on auth.users;
drop function if exists public.create_organization_signup_records();

create or replace function public.approve_organization_account(p_request_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare request_row public.account_requests%rowtype; organization_uuid uuid;
begin
  if p_decision not in ('approved','rejected') then raise exception 'Invalid decision.'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and is_enabled) then raise exception 'Admin access required.'; end if;
  select * into request_row from public.account_requests where id = p_request_id for update;
  if not found then raise exception 'Account request not found.'; end if;
  if p_decision = 'approved' then
    insert into public.organizations (organization_name) values (request_row.organization_name)
    on conflict (organization_name) do update set updated_at = now()
    returning id into organization_uuid;
    update public.profiles set organization_id = organization_uuid, organization_name = request_row.organization_name, approval_status = 'approved', is_enabled = true, permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":true}'::jsonb, updated_at = now() where id = request_row.user_id;
  else
    update public.profiles set approval_status = 'rejected', is_enabled = false, permissions = coalesce(permissions, '{}'::jsonb) || '{"enabled":false}'::jsonb, updated_at = now() where id = request_row.user_id;
  end if;
  update public.account_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_request_id;
end $$;

grant execute on function public.approve_organization_account(uuid, text) to authenticated;
