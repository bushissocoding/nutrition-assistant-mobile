create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  in_app_appointments boolean not null default true,
  in_app_payments boolean not null default true,
  in_app_messages boolean not null default true,
  push_enabled boolean not null default false,
  push_appointments boolean not null default true,
  push_payments boolean not null default true,
  push_messages boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null check (length(expo_push_token) between 10 and 512 and expo_push_token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  updated_at timestamptz not null default now(),
  constraint notification_devices_owner_token_unique unique (user_id, expo_push_token),
  constraint notification_devices_token_unique unique (expo_push_token)
);

create index if not exists notification_devices_active_by_owner on public.notification_devices (user_id, updated_at desc) where status = 'active';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_key text not null check (length(event_key) between 8 and 200),
  kind text not null check (kind in ('appointment', 'payment', 'message')),
  reference_id uuid,
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 240),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_owner_event_unique unique (user_id, event_key)
);

create index if not exists notifications_owner_inbox on public.notifications (user_id, created_at desc, id desc);
create index if not exists notifications_owner_unread on public.notifications (user_id, created_at desc, id desc) where read_at is null;

create table if not exists public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  device_id uuid not null references public.notification_devices (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'leased', 'ticketed', 'checking_receipt', 'receipt_ok', 'failed')),
  ticket_id text,
  attempts smallint not null default 0 check (attempts between 0 and 10),
  receipt_attempts smallint not null default 0 check (receipt_attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_outbox_notification_device_unique unique (notification_id, device_id),
  constraint push_outbox_ticket_state check (status not in ('ticketed', 'checking_receipt', 'receipt_ok') or ticket_id is not null)
);

create index if not exists push_outbox_due on public.push_outbox (next_attempt_at, created_at, id) where status in ('queued', 'ticketed');

alter table public.notification_preferences enable row level security;
alter table public.notification_devices enable row level security;
alter table public.notifications enable row level security;
alter table public.push_outbox enable row level security;

revoke all on public.notification_preferences, public.notification_devices, public.notifications, public.push_outbox from anon, authenticated;
grant select on public.notification_preferences, public.notifications to authenticated;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.save_notification_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_preferences public.notification_preferences%rowtype;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NOTIFICATION_PREFERENCES';
  end if;
  if jsonb_object_length(p_preferences) <> 7
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

create or replace function public.register_notification_device(p_expo_push_token text, p_platform text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_device public.notification_devices%rowtype;
  v_push_enabled boolean;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_expo_push_token is null or length(p_expo_push_token) not between 10 and 512
    or p_expo_push_token !~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9+/_=-]+\]$'
    or p_platform is null or p_platform not in ('ios', 'android') then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_DEVICE';
  end if;
  select coalesce(push_enabled, false) into v_push_enabled from public.notification_preferences where user_id = v_user;
  if not coalesce(v_push_enabled, false) then raise exception using errcode = '42501', message = 'PUSH_OPT_IN_REQUIRED'; end if;
  delete from public.push_outbox where device_id in (select id from public.notification_devices where expo_push_token = p_expo_push_token);
  insert into public.notification_devices (user_id, expo_push_token, platform, status)
    values (v_user, p_expo_push_token, p_platform, 'active')
    on conflict (expo_push_token) do update set user_id = excluded.user_id, platform = excluded.platform, status = 'active', updated_at = now()
    returning * into v_device;
  return jsonb_build_object('registered', true, 'platform', v_device.platform);
end;
$$;

create or replace function public.unregister_notification_device(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  delete from public.notification_devices where user_id = auth.uid() and expo_push_token = p_expo_push_token;
end;
$$;

create or replace function public.mark_notifications_read(p_notification_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  update public.notifications set read_at = now()
    where user_id = auth.uid() and read_at is null and (p_notification_id is null or id = p_notification_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.emit_notification(p_user_id uuid, p_event_key text, p_kind text, p_reference_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_preferences public.notification_preferences%rowtype;
  v_notification_id uuid;
begin
  if p_user_id is null or p_kind not in ('appointment', 'payment', 'message') then return; end if;
  select * into v_preferences from public.notification_preferences where user_id = p_user_id;
  if p_kind = 'appointment' and not coalesce(v_preferences.in_app_appointments, true) and not (coalesce(v_preferences.push_enabled, false) and coalesce(v_preferences.push_appointments, true)) then return; end if;
  if p_kind = 'payment' and not coalesce(v_preferences.in_app_payments, true) and not (coalesce(v_preferences.push_enabled, false) and coalesce(v_preferences.push_payments, true)) then return; end if;
  if p_kind = 'message' and not coalesce(v_preferences.in_app_messages, true) and not (coalesce(v_preferences.push_enabled, false) and coalesce(v_preferences.push_messages, true)) then return; end if;
  insert into public.notifications (user_id, event_key, kind, reference_id, title, body)
  values (p_user_id, p_event_key, p_kind, p_reference_id,
    case p_kind when 'appointment' then 'Lịch hẹn có cập nhật' when 'payment' then 'Thanh toán có cập nhật' else 'Bạn có tin nhắn mới' end,
    'Mở ứng dụng để xem thông tin mới nhất.')
  on conflict (user_id, event_key) do nothing returning id into v_notification_id;
  if v_notification_id is null then return; end if;
  if coalesce(v_preferences.push_enabled, false)
    and ((p_kind = 'appointment' and coalesce(v_preferences.push_appointments, true))
      or (p_kind = 'payment' and coalesce(v_preferences.push_payments, true))
      or (p_kind = 'message' and coalesce(v_preferences.push_messages, true))) then
    insert into public.push_outbox (notification_id, device_id)
      select v_notification_id, device.id from public.notification_devices device
      where device.user_id = p_user_id and device.status = 'active'
      on conflict (notification_id, device_id) do nothing;
  end if;
end;
$$;

create or replace function public.notify_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_user uuid;
begin
  if tg_op = 'INSERT' then
    perform public.emit_notification(new.patient_user_id, 'appointment:' || new.id::text || ':created', 'appointment', new.id);
    select user_id into v_provider_user from public.care_providers where id = new.provider_id;
    perform public.emit_notification(v_provider_user, 'appointment:' || new.id::text || ':provider-created', 'appointment', new.id);
  elsif old.status is distinct from new.status then
    if new.status = 'confirmed' then
      perform public.emit_notification(new.patient_user_id, 'appointment:' || new.id::text || ':confirmed', 'appointment', new.id);
    elsif new.status in ('cancelled', 'expired', 'completed') then
      perform public.emit_notification(new.patient_user_id, 'appointment:' || new.id::text || ':' || new.status, 'appointment', new.id);
      select user_id into v_provider_user from public.care_providers where id = new.provider_id;
      perform public.emit_notification(v_provider_user, 'appointment:' || new.id::text || ':' || new.status, 'appointment', new.id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_emit_notification on public.appointments;
create trigger appointments_emit_notification after insert or update of status on public.appointments
for each row execute function public.notify_appointment_change();

create or replace function public.notify_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.emit_notification(new.patient_user_id, 'payment:' || new.id::text || ':paid', 'payment', new.appointment_id);
  end if;
  return new;
end;
$$;

drop trigger if exists appointment_payments_emit_notification on public.appointment_payments;
create trigger appointment_payments_emit_notification after insert or update of status on public.appointment_payments
for each row execute function public.notify_payment_change();

create or replace function public.notify_incoming_appointment_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient_user uuid;
  v_provider_user uuid;
  v_recipient_user uuid;
begin
  select appointment.patient_user_id, provider.user_id into v_patient_user, v_provider_user
    from public.appointments appointment left join public.care_providers provider on provider.id = appointment.provider_id
    where appointment.id = new.appointment_id;
  if new.sender_user_id = v_patient_user then v_recipient_user := v_provider_user;
  else v_recipient_user := v_patient_user; end if;
  perform public.emit_notification(v_recipient_user, 'message:' || new.id::text || ':received', 'message', new.appointment_id);
  return new;
end;
$$;

drop trigger if exists appointment_messages_emit_notification on public.appointment_messages;
create trigger appointment_messages_emit_notification after insert on public.appointment_messages
for each row execute function public.notify_incoming_appointment_message();

create or replace function public.claim_push_outbox(p_limit integer default 100, p_lease_seconds integer default 60)
returns table(outbox_id uuid, expo_push_token text, notification_id uuid, title text, body text, ticket_id text, status text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 15 and 300 then raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM'; end if;
  return query
  with picked as (
    select outbox.id from public.push_outbox outbox
    where ((outbox.status = 'queued' and outbox.next_attempt_at <= now()) or (outbox.status = 'leased' and outbox.lease_until < now()))
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    limit p_limit for update skip locked
  ), claimed as (
    update public.push_outbox outbox set status = 'leased', lease_until = now() + make_interval(secs => p_lease_seconds), attempts = outbox.attempts + 1, updated_at = now()
    from picked where outbox.id = picked.id returning outbox.*
  )
  select claimed.id, device.expo_push_token, notification.id, 'Nutrition Assistant', 'Bạn có thông báo mới. Mở ứng dụng để xem.', null::text, claimed.status
  from claimed join public.notification_devices device on device.id = claimed.device_id and device.status = 'active'
    join public.notifications notification on notification.id = claimed.notification_id;
end;
$$;

create or replace function public.record_push_ticket(p_outbox_id uuid, p_ticket_id text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id from public.push_outbox where id = p_outbox_id for update;
  if not found then return; end if;
  if p_ticket_id is not null and length(p_ticket_id) between 1 and 200 and p_error_code is null then
    update public.push_outbox set status = 'ticketed', ticket_id = p_ticket_id, next_attempt_at = now() + interval '15 minutes', lease_until = null, last_error_code = null, updated_at = now() where id = p_outbox_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update public.notification_devices set status = 'disabled', updated_at = now() where id = v_device_id;
    update public.push_outbox set status = 'failed', lease_until = null, last_error_code = p_error_code, updated_at = now() where id = p_outbox_id;
  else
    update public.push_outbox set status = case when attempts >= 5 then 'failed' else 'queued' end,
      next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 7))::integer)),
      lease_until = null, last_error_code = left(coalesce(p_error_code, 'PUSH_PROVIDER_ERROR'), 80), updated_at = now()
      where id = p_outbox_id;
  end if;
end;
$$;

create or replace function public.claim_push_receipts(p_limit integer default 100, p_lease_seconds integer default 60)
returns table(outbox_id uuid, ticket_id text, receipt_attempt smallint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 100 or p_lease_seconds not between 15 and 300 then raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM'; end if;
  return query
  with picked as (
    select outbox.id from public.push_outbox outbox
    where (outbox.status = 'ticketed' and outbox.next_attempt_at <= now()) or (outbox.status = 'checking_receipt' and outbox.lease_until < now())
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    limit p_limit for update skip locked
  ), claimed as (
    update public.push_outbox outbox set status = 'checking_receipt', lease_until = now() + make_interval(secs => p_lease_seconds), receipt_attempts = outbox.receipt_attempts + 1, updated_at = now()
    from picked where outbox.id = picked.id returning outbox.*
  ) select claimed.id, claimed.ticket_id, claimed.receipt_attempts from claimed;
end;
$$;

create or replace function public.record_push_receipt(p_outbox_id uuid, p_status text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
  v_receipt_attempts smallint;
begin
  select device_id, receipt_attempts into v_device_id, v_receipt_attempts from public.push_outbox where id = p_outbox_id for update;
  if not found then return; end if;
  if p_status = 'ok' then
    update public.push_outbox set status = 'receipt_ok', lease_until = null, last_error_code = null, updated_at = now() where id = p_outbox_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update public.notification_devices set status = 'disabled', updated_at = now() where id = v_device_id;
    update public.push_outbox set status = 'failed', lease_until = null, last_error_code = p_error_code, updated_at = now() where id = p_outbox_id;
  else
    update public.push_outbox set status = case when v_receipt_attempts >= 5 then 'failed' else 'ticketed' end,
      next_attempt_at = now() + interval '15 minutes', lease_until = null,
      last_error_code = left(coalesce(p_error_code, 'PUSH_RECEIPT_PENDING'), 80), updated_at = now() where id = p_outbox_id;
  end if;
end;
$$;

revoke all on function public.save_notification_preferences(jsonb) from public, anon;
grant execute on function public.save_notification_preferences(jsonb) to authenticated;
revoke all on function public.register_notification_device(text, text), public.unregister_notification_device(text), public.mark_notifications_read(uuid) from public, anon;
grant execute on function public.register_notification_device(text, text), public.unregister_notification_device(text), public.mark_notifications_read(uuid) to authenticated;
revoke all on function public.emit_notification(uuid, text, text, uuid), public.notify_appointment_change(), public.notify_payment_change(), public.notify_incoming_appointment_message() from public, anon, authenticated;
revoke all on function public.claim_push_outbox(integer, integer), public.record_push_ticket(uuid, text, text), public.claim_push_receipts(integer, integer), public.record_push_receipt(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(integer, integer), public.record_push_ticket(uuid, text, text), public.claim_push_receipts(integer, integer), public.record_push_receipt(uuid, text, text) to service_role;
