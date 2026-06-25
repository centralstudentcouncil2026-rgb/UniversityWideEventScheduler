-- CSC S.Y.N.C. persistent notifications
-- Run this once in Supabase SQL Editor.
-- This table stores admin schedule-request notifications and creator approval/rejection notifications.

begin;

create table if not exists public.scheduler_notifications (
  notification_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  reference_id text not null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scheduler_notifications_user_created_idx
  on public.scheduler_notifications (user_id, created_at desc);

create index if not exists scheduler_notifications_reference_idx
  on public.scheduler_notifications (reference_id, notification_type);

alter table public.scheduler_notifications enable row level security;

drop policy if exists scheduler_notifications_owner_read on public.scheduler_notifications;
create policy scheduler_notifications_owner_read
on public.scheduler_notifications
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists scheduler_notifications_insert_authenticated on public.scheduler_notifications;
create policy scheduler_notifications_insert_authenticated
on public.scheduler_notifications
for insert
to authenticated
with check (true);

drop policy if exists scheduler_notifications_update_authenticated on public.scheduler_notifications;
create policy scheduler_notifications_update_authenticated
on public.scheduler_notifications
for update
to authenticated
using (user_id = auth.uid() or public.is_enabled_admin())
with check (user_id = auth.uid() or public.is_enabled_admin());

grant select, insert, update on public.scheduler_notifications to authenticated;

notify pgrst, 'reload schema';

commit;
