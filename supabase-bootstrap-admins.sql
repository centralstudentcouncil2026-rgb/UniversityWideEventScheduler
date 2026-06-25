-- Run after supabase-unified-calendar.sql.
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
    select id into admin_id from auth.users where lower(email) = admin_email limit 1;
    if admin_id is null then
      admin_id := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
      values (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', admin_email,
        extensions.crypt(admin_password, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', initcap(split_part(admin_email, '@', 1))), now(), now(), '', '', '', '');
    else
      update auth.users
      set encrypted_password = extensions.crypt(admin_password, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()),
          raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
          confirmation_token = '',
          recovery_token = '',
          raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', initcap(split_part(admin_email, '@', 1))),
          updated_at = now()
      where id = admin_id;
    end if;
    delete from auth.identities where user_id = admin_id and provider = 'email';
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (admin_id, admin_id, admin_email,
      jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now());
    insert into public.profiles (id, full_name, email, role, account_type, is_enabled, permissions)
    values (admin_id, initcap(split_part(admin_email, '@', 1)), admin_email, 'super_admin', 'CSC', true,
      jsonb_build_object(
        'enabled', true,
        'manageAccounts', true,
        'approveEvents', true,
        'editAllEvents', true,
        'deleteAllEvents', true,
        'manageBlockedTimes', true,
        'manageAnnouncements', true,
        'updatePresidentStatus', admin_email = 'cscadmin2@aup.edu.ph',
        'updateOfficeStatus', admin_email = 'cscadmin1@aup.edu.ph',
        'manageCategories', true
      ))
    on conflict (id) do update set
      full_name = excluded.full_name, email = excluded.email, role = excluded.role,
      account_type = excluded.account_type, is_enabled = true, permissions = excluded.permissions,
      updated_at = now();
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to anon, authenticated;
notify pgrst, 'reload schema';
