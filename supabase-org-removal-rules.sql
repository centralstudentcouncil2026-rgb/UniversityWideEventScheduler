-- CSC S.Y.N.C. org removal rules
-- Run this once in Supabase SQL Editor.
-- Purpose:
--   1. Org-created schedules that are not yet approved are removed from calendar_items immediately.
--   2. Approved schedules are not removed directly by org users; they must go through the pending removal request flow first.
--   3. When an approved removal request is approved by admin, the schedule is removed from calendar_items.

begin;

create or replace function public.apply_org_schedule_removal_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.record_type = 'schedule'
     and new.event_status = 'cancelled'
     and coalesce(old.approval_status, 'pending') <> 'approved' then
    delete from public.calendar_items where id = old.id;
    return null;
  end if;

  if old.record_type = 'schedule'
     and old.pending_action = 'remove'
     and new.revision_status = 'approved' then
    delete from public.calendar_items where id = old.id;
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists org_schedule_removal_rules on public.calendar_items;
create trigger org_schedule_removal_rules
before update on public.calendar_items
for each row
execute function public.apply_org_schedule_removal_rules();

notify pgrst, 'reload schema';

commit;
