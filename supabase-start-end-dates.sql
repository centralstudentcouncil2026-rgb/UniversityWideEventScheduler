-- CSC S.Y.N.C. explicit schedule date columns
-- Run this once in Supabase SQL Editor.
-- Keeps start_date and end_date in calendar_items beside start_time and end_time.

begin;

alter table public.calendar_items add column if not exists start_date date;
alter table public.calendar_items add column if not exists end_date date;

update public.calendar_items
set start_date = coalesce(start_date, (start_time at time zone 'Asia/Manila')::date),
    end_date = coalesce(end_date, (end_time at time zone 'Asia/Manila')::date)
where record_type = 'schedule';

notify pgrst, 'reload schema';

commit;
