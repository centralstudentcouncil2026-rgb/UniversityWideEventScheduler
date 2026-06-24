-- Relational organization signup and Admin approval workflow.

alter table public.profiles add column if not exists approval_status text not null default 'approved'
  check (approval_status in ('pending','approved','rejected'));

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
    update public.profiles set organization_id = organization_uuid, approval_status = 'approved', is_enabled = true, updated_at = now() where id = request_row.user_id;
  else
    update public.profiles set approval_status = 'rejected', is_enabled = false, updated_at = now() where id = request_row.user_id;
  end if;
  update public.account_requests set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = p_request_id;
end $$;

grant execute on function public.approve_organization_account(uuid, text) to authenticated;
