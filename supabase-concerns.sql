-- CSC S.Y.N.C. concerns storage update.
-- Run this in Supabase SQL Editor once. It is additive and does not reset data.

begin;

create table if not exists public.concerns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  title text not null,
  category text not null default 'Other concerns',
  priority text not null default 'normal'
    check (priority in ('normal', 'important', 'urgent')),
  description text not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'resolved', 'rejected')),
  admin_response text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.concerns add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.concerns add column if not exists organization_name text;
alter table public.concerns add column if not exists title text;
alter table public.concerns add column if not exists category text not null default 'Other concerns';
alter table public.concerns add column if not exists priority text not null default 'normal';
alter table public.concerns add column if not exists description text;
alter table public.concerns add column if not exists status text not null default 'pending';
alter table public.concerns add column if not exists admin_response text;
alter table public.concerns add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.concerns add column if not exists created_at timestamptz not null default now();
alter table public.concerns add column if not exists updated_at timestamptz not null default now();

create index if not exists concerns_org_status_idx on public.concerns (organization_id, status, created_at desc);
create index if not exists concerns_created_by_idx on public.concerns (created_by, created_at desc);
create index if not exists concerns_status_idx on public.concerns (status, created_at desc);

create or replace function public.is_enabled_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
      and is_enabled
  );
$$;

alter table public.concerns enable row level security;

drop policy if exists concerns_authenticated_read on public.concerns;
create policy concerns_authenticated_read on public.concerns
  for select to authenticated
  using (
    public.is_enabled_admin()
    or created_by = auth.uid()
    or organization_id in (
      select organization_id
      from public.profiles
      where id = auth.uid()
    )
  );

drop policy if exists concerns_organization_insert on public.concerns;
create policy concerns_organization_insert on public.concerns
  for insert to authenticated
  with check (
    public.is_enabled_admin()
    or (
      created_by = auth.uid()
      and organization_id in (
        select organization_id
        from public.profiles
        where id = auth.uid()
          and role = 'organization_manager'
          and approval_status = 'approved'
          and is_enabled
      )
    )
  );

drop policy if exists concerns_authenticated_update on public.concerns;
create policy concerns_authenticated_update on public.concerns
  for update to authenticated
  using (
    public.is_enabled_admin()
    or created_by = auth.uid()
  )
  with check (
    public.is_enabled_admin()
    or created_by = auth.uid()
  );

drop policy if exists concerns_admin_delete on public.concerns;
create policy concerns_admin_delete on public.concerns
  for delete to authenticated
  using (public.is_enabled_admin());

grant select, insert, update, delete on public.concerns to authenticated;

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    begin
      alter publication supabase_realtime add table public.concerns;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
