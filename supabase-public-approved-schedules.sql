-- Public visibility rule for the unified calendar_items table.
-- Included in supabase-unified-calendar.sql; run separately only to restore this policy.

alter table public.calendar_items enable row level security;

drop policy if exists calendar_items_public_read on public.calendar_items;
create policy calendar_items_public_read on public.calendar_items
  for select to anon
  using (
    record_type in ('category', 'blocked_time')
    or (record_type = 'schedule' and approval_status = 'approved' and privacy_level = 'basic')
  );

grant select on public.calendar_items to anon;
