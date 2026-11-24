begin;

select plan(5);

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('11110000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-one@example.test', '{}'::jsonb, '{"username":"rls-one"}'::jsonb),
  ('11110000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-two@example.test', '{}'::jsonb, '{"username":"rls-two"}'::jsonb);

insert into public.profiles (id, username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type)
values
  ('11110000-0000-4000-8000-000000000001', 'rls-one', 'healthy', 'unspecified', 30, 170, 65, 'moderate', 'unspecified'),
  ('11110000-0000-4000-8000-000000000002', 'rls-two', 'healthy', 'unspecified', 31, 171, 66, 'moderate', 'unspecified');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11110000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11110000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.profiles), 1, 'account one reads only its own profile');
select is((with changed as (
  update public.profiles set username = 'stolen-profile'
  where id = '11110000-0000-4000-8000-000000000002' returning id
) select count(*)::integer from changed), 0, 'account one cannot update account two profile');
select throws_ok($query$
  insert into public.profiles (id, username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type)
  values ('11110000-0000-4000-8000-000000000002', 'stolen-profile', 'healthy', 'unspecified', 30, 170, 65, 'moderate', 'unspecified')
$query$, '42501', null, 'account one cannot insert a profile owned by account two');

reset role;
select set_config('request.jwt.claim.sub', '11110000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"11110000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*)::integer from public.profiles), 1, 'account two reads only its own profile');
select is((select username from public.profiles), 'rls-two', 'account two receives its own row');

select * from finish();
rollback;
