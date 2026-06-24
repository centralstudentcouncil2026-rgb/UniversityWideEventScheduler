-- Relational organization signup and Admin approval workflow.

alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved','rejected'));

create or replace function public.create_organization_signup_records()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  organization_name text := nullif(new.raw_user_meta_data->>'organization_name', '');
  contact_number text := nullif(new.raw_user_meta_data->>'contact_number', '');
begin
  if new.raw_user_meta_data->>'account_type' <> 'org' then return new; end if;
  if organization_name is null or contact_number !~ '^[0-9]{11}$' or new.email !~* '^[^@]+@aup\\.edu\\.ph$' then
    raise exception 'Organization signup requires AUP email, organization name, and 11-digit contact number.';
  end if;
  insert into public.profiles (id, full_name, email, role, account_type, contact_number, approval_status, is_enabled)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'organization_manager', 'org', contact_number, 'pending', false)
  on conflict (id) do nothing;
  insert into public.account_requests (user_id, full_name, aup_email, contact_number, organization_name, status)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, contact_number, organization_name, 'pending')
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists organization_signup_records on auth.users;
create trigger organization_signup_records after insert on auth.users
for each row execute function public.create_organization_signup_records();

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
    update public.profiles set organization_id = organization_uuid, approval_status = 'approved', is_enabled = true, updated_at = now() where id = request_row.user_id;
  else
    update public.profiles set approval_status = 'rejected', is_enabled = false, updated_at = now() where id = request_row.user_id;
  end if;
  update public.account_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_request_id;
end $$;

grant execute on function public.approve_organization_account(uuid, text) to authenticated;
