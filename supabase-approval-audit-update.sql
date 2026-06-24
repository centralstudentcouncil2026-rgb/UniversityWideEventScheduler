-- CSC S.Y.N.C. approval and revision accountability update.
-- Run once in Supabase SQL Editor before using the updated approval workflow.

alter table if exists public.schedules
  add column if not exists approved_by uuid references auth.users(id) on update cascade on delete set null;

alter table if exists public.schedules
  add column if not exists reviewed_by uuid references auth.users(id) on update cascade on delete set null;

create index if not exists schedules_approved_by_idx on public.schedules(approved_by);
create index if not exists schedules_reviewed_by_idx on public.schedules(reviewed_by);

notify pgrst, 'reload schema';
