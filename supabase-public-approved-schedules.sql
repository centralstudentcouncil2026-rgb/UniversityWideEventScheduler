-- CSC S.Y.N.C. Public View schedule policy.
-- Run once in Supabase SQL Editor. Public View receives only approved,
-- public schedules and their occurrences. Blocked calendar periods stay private.

grant select on public.schedules, public.schedule_organizations, public.schedule_occurrences to anon;

alter table public.schedules enable row level security;
alter table public.schedule_occurrences enable row level security;

drop policy if exists schedules_public_approved_select on public.schedules;
create policy schedules_public_approved_select
  on public.schedules
  for select
  to anon
  using (
    approval_status = 'approved'
    and privacy_level = 'basic'
    and revision_of is null
    and event_status not in ('cancelled', 'disabled', 'draft')
  );

drop policy if exists schedule_occurrences_public_approved_select on public.schedule_occurrences;
create policy schedule_occurrences_public_approved_select
  on public.schedule_occurrences
  for select
  to anon
  using (
    exists (
      select 1
      from public.schedules schedule
      where schedule.id = schedule_occurrences.schedule_id
        and schedule.approval_status = 'approved'
        and schedule.privacy_level = 'basic'
        and schedule.revision_of is null
        and schedule.event_status not in ('cancelled', 'disabled', 'draft')
    )
  );

notify pgrst, 'reload schema';
