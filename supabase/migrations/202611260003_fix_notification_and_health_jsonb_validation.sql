create or replace function public.save_notification_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_preferences public.notification_preferences%rowtype;
  v_key_count integer;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_PREFERENCES';
  end if;
  select count(*) into v_key_count from jsonb_object_keys(p_preferences);
  if v_key_count <> 7
    or not (p_preferences ?& array['inAppAppointments','inAppPayments','inAppMessages','pushEnabled','pushAppointments','pushPayments','pushMessages'])
    or exists (select 1 from jsonb_each(p_preferences) where jsonb_typeof(value) <> 'boolean') then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_PREFERENCES';
  end if;
  insert into public.notification_preferences (user_id, in_app_appointments, in_app_payments, in_app_messages, push_enabled, push_appointments, push_payments, push_messages)
  values (v_user, (p_preferences->>'inAppAppointments')::boolean, (p_preferences->>'inAppPayments')::boolean,
    (p_preferences->>'inAppMessages')::boolean, (p_preferences->>'pushEnabled')::boolean,
    (p_preferences->>'pushAppointments')::boolean, (p_preferences->>'pushPayments')::boolean, (p_preferences->>'pushMessages')::boolean)
  on conflict (user_id) do update set in_app_appointments = excluded.in_app_appointments,
    in_app_payments = excluded.in_app_payments, in_app_messages = excluded.in_app_messages,
    push_enabled = excluded.push_enabled, push_appointments = excluded.push_appointments,
    push_payments = excluded.push_payments, push_messages = excluded.push_messages, updated_at = now()
  returning * into v_preferences;
  if not v_preferences.push_enabled then
    update public.notification_devices set status = 'disabled', updated_at = now() where user_id = v_user and status = 'active';
  end if;
  return jsonb_build_object('inAppAppointments', v_preferences.in_app_appointments, 'inAppPayments', v_preferences.in_app_payments,
    'inAppMessages', v_preferences.in_app_messages, 'pushEnabled', v_preferences.push_enabled,
    'pushAppointments', v_preferences.push_appointments, 'pushPayments', v_preferences.push_payments,
    'pushMessages', v_preferences.push_messages, 'updatedAt', v_preferences.updated_at);
end;
$$;

revoke all on function public.save_notification_preferences(jsonb) from public, anon;
grant execute on function public.save_notification_preferences(jsonb) to authenticated;

create or replace function public.save_health_record(
  p_record_id uuid,
  p_request_key uuid,
  p_title text,
  p_source_date date,
  p_note text,
  p_results jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_record public.health_records%rowtype;
  v_candidate jsonb;
  v_candidate_key_count integer;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_health_record_consent(v_user);
  if p_title is null or length(btrim(p_title)) not between 1 and 120 or p_note is null or length(p_note) > 1000
    or jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD';
  end if;
  if p_record_id is null then
    if p_request_key is null then raise exception using errcode = '22023', message = 'HEALTH_RECORD_REQUEST_KEY_REQUIRED'; end if;
    insert into public.health_records (user_id, request_key, title, source_date, note)
      values (v_user, p_request_key, btrim(p_title), p_source_date, p_note)
      on conflict (user_id, request_key) do update set title = excluded.title, source_date = excluded.source_date,
        note = excluded.note, updated_at = now() returning * into v_record;
    delete from public.health_record_results where record_id = v_record.id and user_id = v_user;
  else
    update public.health_records set title = btrim(p_title), source_date = p_source_date, note = p_note, updated_at = now()
      where id = p_record_id and user_id = v_user returning * into v_record;
    if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
    delete from public.health_record_results where record_id = v_record.id and user_id = v_user;
  end if;
  for v_candidate in select value from jsonb_array_elements(p_results) loop
    if jsonb_typeof(v_candidate) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'INVALID_CONFIRMED_HEALTH_RESULT';
    end if;
    select count(*) into v_candidate_key_count from jsonb_object_keys(v_candidate);
    if v_candidate_key_count <> 5
      or coalesce(v_candidate ->> 'confirmed', 'false') <> 'true'
      or not (v_candidate ?& array['name', 'value', 'unit', 'referenceRange', 'confirmed'])
      or length(btrim(coalesce(v_candidate ->> 'name', ''))) not between 1 and 100
      or length(btrim(coalesce(v_candidate ->> 'value', ''))) not between 1 and 100
      or length(coalesce(v_candidate ->> 'unit', '')) > 40
      or length(coalesce(v_candidate ->> 'referenceRange', '')) > 80 then
      raise exception using errcode = '22023', message = 'INVALID_CONFIRMED_HEALTH_RESULT';
    end if;
    insert into public.health_record_results (record_id, user_id, name, value, unit, reference_range)
      values (v_record.id, v_user, btrim(v_candidate ->> 'name'), btrim(v_candidate ->> 'value'),
        coalesce(btrim(v_candidate ->> 'unit'), ''), coalesce(btrim(v_candidate ->> 'referenceRange'), ''));
  end loop;
  return v_record.id;
end;
$$;
