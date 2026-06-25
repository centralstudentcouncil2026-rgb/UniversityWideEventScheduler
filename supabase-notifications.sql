-- CSC S.Y.N.C. persistent schedule notifications
-- Run this once in Supabase SQL Editor.
-- Supabase creates notifications automatically when calendar_items schedules are submitted, revised, approved, or rejected.

begin;

create table if not exists public.scheduler_notifications (
  notification_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('schedule_update', 'schedule_revision', 'schedule_approval')),
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

-- The current static app reads notifications through the published client key.
-- The query is still filtered by user_id in the client bridge.
drop policy if exists scheduler_notifications_public_read on public.scheduler_notifications;
create policy scheduler_notifications_public_read
on public.scheduler_notifications
for select
to anon, authenticated
using (true);

drop policy if exists scheduler_notifications_public_update_read_flag on public.scheduler_notifications;
create policy scheduler_notifications_public_update_read_flag
on public.scheduler_notifications
for update
to anon, authenticated
using (true)
with check (true);

grant select, update on public.scheduler_notifications to anon, authenticated;

drop function if exists public.create_schedule_notification_from_calendar_item() cascade;
create function public.create_schedule_notification_from_calendar_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_record record;
  notice_type text;
  notice_title text;
  notice_message text;
  decision_word text;
begin
  if new.record_type <> 'schedule' then
    return new;
  end if;

  if new.approval_status = 'pending' then
    notice_type := case when coalesce(new.revision_of, '') <> '' then 'schedule_revision' else 'schedule_update' end;
    notice_title := case when notice_type = 'schedule_revision' then 'Schedule Revision Submitted' else 'New Schedule Request' end;
    notice_message := case when notice_type = 'schedule_revision'
      then 'A schedule revision for "' || coalesce(new.title, 'Untitled schedule') || '" needs review.'
      else 'A new schedule "' || coalesce(new.title, 'Untitled schedule') || '" needs review.'
    end;

    for admin_record in
      select id from public.profiles
      where role = 'super_admin'
        and coalesce(is_enabled, true) = true
    loop
      insert into public.scheduler_notifications (
        notification_id, user_id, notification_type, reference_id, title, message, is_read, created_at, updated_at
      ) values (
        notice_type || '-' || new.id || '-' || admin_record.id,
        admin_record.id,
        notice_type,
        new.id,
        notice_title,
        notice_message,
        false,
        now(),
        now()
      )
      on conflict (notification_id) do update
        set title = excluded.title,
            message = excluded.message,
            is_read = false,
            updated_at = now();
    end loop;
  end if;

  if new.approval_status in ('approved', 'rejected')
     and new.created_by is not null
     and (tg_op = 'INSERT' or old.approval_status is distinct from new.approval_status) then
    decision_word := case when new.approval_status = 'approved' then 'Approved' else 'Rejected' end;

    insert into public.scheduler_notifications (
      notification_id, user_id, notification_type, reference_id, title, message, is_read, created_at, updated_at
    ) values (
      'schedule-' || new.approval_status || '-' || new.id || '-' || new.created_by,
      new.created_by,
      'schedule_approval',
      new.id,
      decision_word || ' Schedule Request',
      'Your schedule "' || coalesce(new.title, 'Untitled schedule') || '" was ' || new.approval_status || '.',
      false,
      now(),
      now()
    )
    on conflict (notification_id) do update
      set title = excluded.title,
          message = excluded.message,
          is_read = false,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists calendar_items_schedule_notifications on public.calendar_items;
create trigger calendar_items_schedule_notifications
after insert or update on public.calendar_items
for each row
execute function public.create_schedule_notification_from_calendar_item();

notify pgrst, 'reload schema';

commit;
