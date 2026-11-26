begin;

select plan(26);

select ok((
  select count(*) = 24 and bool_and(relation.relrowsecurity)
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and relation.relname::text = any(array[
      'profiles', 'consent_records', 'meal_plans', 'meal_entries', 'shopping_lists', 'shopping_list_items',
      'pantry_items', 'care_providers', 'care_provider_credentials', 'provider_availability', 'appointments',
      'appointment_payments', 'payment_webhook_events', 'assistant_ai_consents', 'assistant_threads',
      'assistant_turns', 'appointment_messages', 'health_records', 'health_record_results',
      'notification_preferences', 'notification_devices', 'notifications', 'push_outbox', 'nutrition_preferences'
    ])
), 'RLS enabled on all private application tables');

select ok(not exists (
  select 1
  from unnest(array[
    'profiles', 'consent_records', 'meal_plans', 'meal_entries', 'shopping_lists', 'shopping_list_items',
    'pantry_items', 'care_providers', 'care_provider_credentials', 'provider_availability', 'appointments',
    'appointment_payments', 'payment_webhook_events', 'assistant_ai_consents', 'assistant_threads',
    'assistant_turns', 'appointment_messages', 'health_records', 'health_record_results',
    'notification_preferences', 'notification_devices', 'notifications', 'push_outbox', 'nutrition_preferences'
  ]) as private_table(name)
  where has_table_privilege('anon', format('public.%I', private_table.name), 'SELECT')
), 'anonymous users cannot read private application tables');

select ok(has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'INSERT'), 'authenticated users can insert an optional profile date of birth');
select ok(has_column_privilege('authenticated', 'public.profiles', 'date_of_birth', 'UPDATE'), 'authenticated users can update an optional profile date of birth');

select ok(exists (
  select 1 from storage.buckets where id = 'health-record-images' and public = false
), 'health record bucket is private');

select is((
  select count(*)::integer from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'health_record_objects_%'
), 4, 'health record storage has owner-path policies for all operations');

insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('11110000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-one@example.test', '{}'::jsonb, '{"username":"rls-one"}'::jsonb),
  ('11110000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-two@example.test', '{}'::jsonb, '{"username":"rls-two"}'::jsonb);

insert into public.profiles (id, username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type)
values
  ('11110000-0000-4000-8000-000000000001', 'rls-one', 'healthy', 'unspecified', 30, 170, 65, 'moderate', 'unspecified'),
  ('11110000-0000-4000-8000-000000000002', 'rls-two', 'healthy', 'unspecified', 31, 171, 66, 'moderate', 'unspecified');

insert into public.consent_records (user_id, version, choices) values
  ('11110000-0000-4000-8000-000000000001', '2026-11-24-v1', '{"profile_processing":true,"nutrition_processing":true,"data_lifecycle":true,"ai_processing":false,"health_record_storage":true}'),
  ('11110000-0000-4000-8000-000000000002', '2026-11-24-v1', '{"profile_processing":true,"nutrition_processing":true,"data_lifecycle":true,"ai_processing":false,"health_record_storage":true}');

insert into public.health_records (id, user_id, request_key, title, note) values
  ('22220000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-000000000001', '33330000-0000-4000-8000-000000000001', 'Synthetic panel one', ''),
  ('22220000-0000-4000-8000-000000000002', '11110000-0000-4000-8000-000000000002', '33330000-0000-4000-8000-000000000002', 'Synthetic panel two', '');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11110000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"11110000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.owns_health_record_source_path('11110000-0000-4000-8000-000000000001/22220000-0000-4000-8000-000000000001'), true, 'account one owns only paths to its own record rows');
select is(public.owns_health_record_source_path('11110000-0000-4000-8000-000000000001/unlinked'), false, 'account one cannot upload to an unlinked arbitrary path');
select is(public.owns_health_record_source_path('11110000-0000-4000-8000-000000000001/nested/22220000-0000-4000-8000-000000000001'), false, 'nested object paths are not valid record source paths');
select is(public.owns_health_record_source_path('11110000-0000-4000-8000-000000000001/22220000-0000-4000-8000-000000000002'), false, 'account one cannot access another account record path');
select is(public.can_upload_health_record_source('11110000-0000-4000-8000-000000000001/22220000-0000-4000-8000-000000000001'), true, 'account one may upload to its own record with current storage consent');
reset role;
insert into public.consent_records (user_id, version, choices, accepted_at)
values ('11110000-0000-4000-8000-000000000001', '2026-11-24-v1', '{"profile_processing":true,"nutrition_processing":true,"data_lifecycle":true,"ai_processing":false,"health_record_storage":false}', now() + interval '1 second');
set local role authenticated;
select is(public.can_upload_health_record_source('11110000-0000-4000-8000-000000000001/22220000-0000-4000-8000-000000000001'), false, 'account one cannot upload after withdrawing health record storage consent');

select is((select count(*)::integer from public.profiles), 1, 'account one reads only its own profile');
select is(
  (public.save_nutrition_preferences('{"dietaryVariety":"balanced","foodPreferences":["easy_cook"],"allergyReminder":true,"trackConfirmedTargets":false}'::jsonb)->>'dietaryVariety'),
  'balanced',
  'account one can save preferences through the authenticated RPC'
);
select is((select count(*)::integer from public.nutrition_preferences), 1, 'account one reads only its own preferences');
select is(
  (public.save_notification_preferences('{"inAppAppointments":true,"inAppPayments":true,"inAppMessages":false,"pushEnabled":false,"pushAppointments":true,"pushPayments":false,"pushMessages":true}'::jsonb)->>'inAppMessages'),
  'false',
  'account one can save notification preferences through the authenticated RPC'
);
select is((select count(*)::integer from public.notification_preferences), 1, 'account one reads only its own notification preferences');
insert into public.profiles (
  id, date_of_birth, username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type,
  allergies, symptom_notes, red_flags, diagnosis_notes, hard_limits, medical_limits_confirmed
)
values (
  '11110000-0000-4000-8000-000000000001', null, 'rls-one-upserted', 'healthy', 'unspecified', 30, 170, 65, 'moderate', 'unspecified',
  '{}', '', '{}', '', '{}'::jsonb, false
)
on conflict (id) do update set
  id = excluded.id,
  date_of_birth = excluded.date_of_birth,
  username = excluded.username,
  mode = excluded.mode,
  gender = excluded.gender,
  age = excluded.age,
  height_cm = excluded.height_cm,
  weight_kg = excluded.weight_kg,
  activity_level = excluded.activity_level,
  condition_type = excluded.condition_type,
  allergies = excluded.allergies,
  symptom_notes = excluded.symptom_notes,
  red_flags = excluded.red_flags,
  diagnosis_notes = excluded.diagnosis_notes,
  hard_limits = excluded.hard_limits,
  medical_limits_confirmed = excluded.medical_limits_confirmed;
select is((select username from public.profiles), 'rls-one-upserted', 'account one can upsert its own profile');
with changed as (
  update public.profiles set username = 'stolen-profile'
  where id = '11110000-0000-4000-8000-000000000002' returning id
)
select is(
  (select count(*)::integer from changed),
  0,
  'account one cannot update account two profile'
);
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
select is(
  (public.save_nutrition_preferences('{"dietaryVariety":"varied","foodPreferences":["vegetarian"],"allergyReminder":false,"trackConfirmedTargets":true}'::jsonb)->>'dietaryVariety'),
  'varied',
  'account two can save its own preferences'
);
select is((select count(*)::integer from public.nutrition_preferences), 1, 'account two cannot read account one preferences');
select is(
  (public.save_notification_preferences('{"inAppAppointments":false,"inAppPayments":true,"inAppMessages":true,"pushEnabled":true,"pushAppointments":false,"pushPayments":true,"pushMessages":true}'::jsonb)->>'pushEnabled'),
  'true',
  'account two can save its own notification preferences'
);
select is((select count(*)::integer from public.notification_preferences), 1, 'account two cannot read account one notification preferences');

select * from finish();
rollback;
