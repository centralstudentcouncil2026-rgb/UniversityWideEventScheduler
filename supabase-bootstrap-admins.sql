-- Run after supabase-relational-reset.sql.
-- Recreates the four CSC Admin accounts. Replace the password once below.

-- In Supabase SQL Editor, replace YOUR_ADMIN_PASSWORD below before running.
select set_config('app.admin_seed_password', 'YOUR_ADMIN_PASSWORD', false);

alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
declare
  admin_email text;
  admin_id uuid;
  admin_password text := current_setting('app.admin_seed_password', true);
begin
  if coalesce(admin_password, '') = '' then raise exception 'Set app.admin_seed_password first.'; end if;
  foreach admin_email in array array['cscadmin1@aup.edu.ph','cscadmin2@aup.edu.ph','cscadmin3@aup.edu.ph','cscadmin4@aup.edu.ph'] loop
    admin_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', admin_email,
      crypt(admin_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
    values (admin_id, admin_id, admin_email, jsonb_build_object('sub', admin_id::text, 'email', admin_email), 'email', now(), now());
    insert into public.profiles (id, full_name, email, role, account_type, is_enabled, permissions)
    values (admin_id, initcap(split_part(admin_email, '@', 1)), admin_email, 'super_admin', 'CSC', true,
      '{"enabled":true,"manageAccounts":true,"approveEvents":true,"editAllEvents":true,"deleteAllEvents":true,"manageBlockedTimes":true,"manageAnnouncements":true,"updatePresidentStatus":true,"updateOfficeStatus":true,"manageCategories":true}'::jsonb);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
notify pgrst, 'reload schema';
