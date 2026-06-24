-- Profile-only organization signup and approval support.
-- Run after supabase-unified-calendar.sql only when profiles RLS is enabled.

begin;

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists organization_name text;
alter table public.profiles add column if not exists contact_number text;
alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending', 'approved', 'rejected'));
alter table public.profiles add column if not exists is_enabled boolean not null default false;
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.profiles enable row level security;

create or replace function public.is_enabled_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'super_admin' and is_enabled);
$$;
grant execute on function public.is_enabled_admin() to authenticated;

drop policy if exists organization_signup_profile_insert on public.profiles;
create policy organization_signup_profile_insert on public.profiles
  for insert to authenticated
  with check (
    id = auth.uid()
    and role = 'organization_manager'
    and account_type = 'org'
    and approval_status = 'pending'
    and is_enabled = false
  );

drop policy if exists profiles_authenticated_select on public.profiles;
create policy profiles_authenticated_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_enabled_admin());

create or replace function public.approve_organization_profile(p_profile_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare profile_row public.profiles%rowtype; organization_uuid uuid;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Invalid decision.'; end if;
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

commit;
