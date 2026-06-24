-- CSC S.Y.N.C. schedule category repair
-- Run this once in Supabase SQL Editor when schedule saves report
-- schedules_category_id_fkey errors.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.schedules'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) ilike '%category_id%'
  loop
    execute format(
      'alter table public.schedules drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

insert into public.schedule_categories (id, name, color, active, updated_at)
values
  ('worship', 'Worship', '#2563EB', true, now()),
  ('gathering', 'Gathering', '#16A34A', true, now()),
  ('outreach', 'Outreach', '#DC2626', true, now()),
  ('socialization', 'Socialization', '#D97706', true, now()),
  ('meeting', 'Meeting', '#7C3AED', true, now()),
  ('others', 'Others', '#64748B', true, now())
on conflict (name) do update
set id = excluded.id,
    color = excluded.color,
    active = true,
    updated_at = now();

update public.schedules
set category_id = 'others'
where category_id not in (select id from public.schedule_categories);

alter table public.schedules
  add constraint schedules_category_id_fkey
  foreign key (category_id)
  references public.schedule_categories(id)
  on update cascade;

notify pgrst, 'reload schema';
