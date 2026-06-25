-- Use this note with supabase-unified-calendar.sql:
-- Schedule categories are now hard-coded in the app.
-- Do not seed categories into public.calendar_items anymore.
-- Existing projects should run supabase-remove-category-records.sql once.

-- Required cleanup for existing projects:
--   delete from public.calendar_items where record_type = 'category';
--   alter table public.calendar_items drop column if exists category_name;
--   alter table public.calendar_items drop column if exists category_color;
--   alter table public.calendar_items drop column if exists category_active;

-- Required schema rule going forward:
--   calendar_items.record_type should allow only: schedule, blocked_time
--   schedules may keep category_id text to reference the app's hard-coded options.
