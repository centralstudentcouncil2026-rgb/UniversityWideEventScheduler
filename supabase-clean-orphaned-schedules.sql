-- CSC S.Y.N.C. cleanup: remove calendar events that have no schedules-table row.
-- Run once in Supabase SQL Editor. It removes stale JSON-only schedules such as
-- the current Org Fair record from every dashboard's shared scheduler state.

update public.scheduler_state scheduler_state
set store = jsonb_set(
  coalesce(scheduler_state.store, '{}'::jsonb),
  '{events}',
  coalesce((
    select jsonb_agg(event_item order by event_item->>'created_at')
    from jsonb_array_elements(coalesce(scheduler_state.store->'events', '[]'::jsonb)) as event_item
    where (event_item->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and exists (
        select 1
        from public.schedules schedule
        where schedule.id = (event_item->>'id')::uuid
      )
  ), '[]'::jsonb),
  true
)
where scheduler_state.store ? 'events';

notify pgrst, 'reload schema';
