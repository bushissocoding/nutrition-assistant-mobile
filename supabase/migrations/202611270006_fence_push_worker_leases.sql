alter table public.push_outbox
  add column if not exists lease_token uuid,
  add column if not exists delivery_started_at timestamptz;

alter table public.push_outbox drop constraint if exists push_outbox_status_check;
alter table public.push_outbox add constraint push_outbox_status_check
  check (status in ('queued', 'leased', 'ticketed', 'checking_receipt', 'receipt_ok', 'delivery_unknown', 'failed'));

-- Old workers cannot prove whether a leased POST reached Expo.
update public.push_outbox
set status = 'delivery_unknown', lease_until = null, lease_token = null,
    last_error_code = 'PUSH_DELIVERY_UNKNOWN', updated_at = now()
where status = 'leased';

-- Receipt checks are read-only, so old receipt leases can safely be retried.
update public.push_outbox
set status = 'ticketed', lease_until = null, lease_token = null, updated_at = now()
where status = 'checking_receipt';

drop function if exists public.claim_push_outbox(integer, integer);
drop function if exists public.record_push_ticket(uuid, text, text);
drop function if exists public.claim_push_receipts(integer, integer);
drop function if exists public.record_push_receipt(uuid, text, text);

create or replace function public.claim_push_outbox(p_limit integer default 10, p_lease_seconds integer default 120)
returns table(outbox_id uuid, expo_push_token text, notification_id uuid, title text, body text, ticket_id text, status text, lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 10 or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM';
  end if;

  return query
  with expired_uncertain as (
    update public.push_outbox outbox
    set status = 'delivery_unknown', lease_until = null, lease_token = null,
        last_error_code = 'PUSH_DELIVERY_UNKNOWN', updated_at = now()
    where outbox.status = 'leased'
      and outbox.lease_until <= now()
      and outbox.delivery_started_at is not null
    returning outbox.id
  ), picked as (
    select outbox.id
    from public.push_outbox outbox
    where (outbox.status = 'queued' and outbox.next_attempt_at <= now())
      or (outbox.status = 'leased' and outbox.lease_until <= now() and outbox.delivery_started_at is null)
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    limit p_limit for update skip locked
  ), claimed as (
    update public.push_outbox outbox
    set status = 'leased', lease_token = gen_random_uuid(),
        delivery_started_at = null,
        lease_until = now() + make_interval(secs => p_lease_seconds),
        attempts = outbox.attempts + 1, updated_at = now()
    from picked
    where outbox.id = picked.id
    returning outbox.*
  )
  select claimed.id, device.expo_push_token, notification.id,
         'Nutrition Assistant', 'Bạn có thông báo mới. Mở ứng dụng để xem.',
         null::text, claimed.status, claimed.lease_token
  from claimed
  join public.notification_devices device on device.id = claimed.device_id and device.status = 'active'
  join public.notifications notification on notification.id = claimed.notification_id;
end;
$$;

create or replace function public.begin_push_delivery(p_outbox_ids uuid[], p_lease_tokens uuid[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_locked integer;
  v_updated integer;
begin
  v_expected := coalesce(cardinality(p_outbox_ids), 0);
  if v_expected not between 1 and 10
    or p_lease_tokens is null
    or cardinality(p_lease_tokens) <> v_expected
    or (select count(distinct requested.outbox_id) from unnest(p_outbox_ids) as requested(outbox_id)) <> v_expected
    or exists (select 1 from unnest(p_lease_tokens) as requested(lease_token) where requested.lease_token is null) then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_DELIVERY_BATCH';
  end if;

  perform outbox.id
  from public.push_outbox outbox
  join unnest(p_outbox_ids, p_lease_tokens) as requested(outbox_id, lease_token)
    on requested.outbox_id = outbox.id and requested.lease_token = outbox.lease_token
  where outbox.status = 'leased'
    and outbox.lease_until > now()
    and outbox.delivery_started_at is null
  order by outbox.id
  for update of outbox;
  get diagnostics v_locked = row_count;
  if v_locked <> v_expected then return false; end if;

  update public.push_outbox outbox
  set delivery_started_at = now(), updated_at = now()
  from unnest(p_outbox_ids, p_lease_tokens) as requested(outbox_id, lease_token)
  where requested.outbox_id = outbox.id
    and requested.lease_token = outbox.lease_token
    and outbox.status = 'leased'
    and outbox.lease_until > now()
    and outbox.delivery_started_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = v_expected;
end;
$$;

create or replace function public.renew_push_outbox_lease(p_outbox_id uuid, p_lease_token uuid, p_lease_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM';
  end if;
  update public.push_outbox
  set lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where id = p_outbox_id and status = 'leased' and lease_token = p_lease_token and lease_until > now();
  return found;
end;
$$;

create or replace function public.record_push_ticket(p_outbox_id uuid, p_lease_token uuid, p_ticket_id text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id
  from public.push_outbox
  where id = p_outbox_id and status = 'leased' and lease_token = p_lease_token and lease_until > now()
  for update;
  if not found then return; end if;

  if p_error_code = 'PUSH_DELIVERY_UNKNOWN' then
    update public.push_outbox
    set status = 'delivery_unknown', lease_until = null, lease_token = null,
        last_error_code = p_error_code, updated_at = now()
    where id = p_outbox_id;
  elsif p_ticket_id is not null and length(p_ticket_id) between 1 and 200 and p_error_code is null then
    update public.push_outbox
    set status = 'ticketed', ticket_id = p_ticket_id, next_attempt_at = now() + interval '15 minutes',
        lease_until = null, lease_token = null, delivery_started_at = null,
        last_error_code = null, updated_at = now()
    where id = p_outbox_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update public.notification_devices set status = 'disabled', updated_at = now() where id = v_device_id;
    update public.push_outbox
    set status = 'failed', lease_until = null, lease_token = null, delivery_started_at = null,
        last_error_code = p_error_code, updated_at = now()
    where id = p_outbox_id;
  else
    update public.push_outbox
    set status = case when attempts >= 5 then 'failed' else 'queued' end,
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 7))::integer)),
        lease_until = null, lease_token = null, delivery_started_at = null,
        last_error_code = left(coalesce(p_error_code, 'PUSH_PROVIDER_ERROR'), 80), updated_at = now()
    where id = p_outbox_id;
  end if;
end;
$$;

create or replace function public.claim_push_receipts(p_limit integer default 10, p_lease_seconds integer default 120)
returns table(outbox_id uuid, ticket_id text, receipt_attempt smallint, lease_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 10 or p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM';
  end if;
  return query
  with picked as (
    select outbox.id
    from public.push_outbox outbox
    where (outbox.status = 'ticketed' and outbox.next_attempt_at <= now())
      or (outbox.status = 'checking_receipt' and outbox.lease_until <= now())
    order by outbox.next_attempt_at, outbox.created_at, outbox.id
    limit p_limit for update skip locked
  ), claimed as (
    update public.push_outbox outbox
    set status = 'checking_receipt', lease_token = gen_random_uuid(),
        lease_until = now() + make_interval(secs => p_lease_seconds),
        receipt_attempts = outbox.receipt_attempts + 1, updated_at = now()
    from picked
    where outbox.id = picked.id
    returning outbox.*
  )
  select claimed.id, claimed.ticket_id, claimed.receipt_attempts, claimed.lease_token from claimed;
end;
$$;

create or replace function public.renew_push_receipt_lease(p_outbox_id uuid, p_lease_token uuid, p_lease_seconds integer default 120)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds not between 30 and 300 then
    raise exception using errcode = '22023', message = 'INVALID_PUSH_CLAIM';
  end if;
  update public.push_outbox
  set lease_until = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  where id = p_outbox_id and status = 'checking_receipt' and lease_token = p_lease_token and lease_until > now();
  return found;
end;
$$;

create or replace function public.record_push_receipt(p_outbox_id uuid, p_lease_token uuid, p_status text, p_error_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
  v_receipt_attempts smallint;
begin
  select device_id, receipt_attempts into v_device_id, v_receipt_attempts
  from public.push_outbox
  where id = p_outbox_id and status = 'checking_receipt' and lease_token = p_lease_token and lease_until > now()
  for update;
  if not found then return; end if;

  if p_status = 'ok' then
    update public.push_outbox
    set status = 'receipt_ok', lease_until = null, lease_token = null,
        last_error_code = null, updated_at = now()
    where id = p_outbox_id;
  elsif p_error_code = 'DeviceNotRegistered' then
    update public.notification_devices set status = 'disabled', updated_at = now() where id = v_device_id;
    update public.push_outbox
    set status = 'failed', lease_until = null, lease_token = null,
        last_error_code = p_error_code, updated_at = now()
    where id = p_outbox_id;
  else
    update public.push_outbox
    set status = case when v_receipt_attempts >= 5 then 'failed' else 'ticketed' end,
        next_attempt_at = now() + interval '15 minutes', lease_until = null, lease_token = null,
        last_error_code = left(coalesce(p_error_code, 'PUSH_RECEIPT_PENDING'), 80), updated_at = now()
    where id = p_outbox_id;
  end if;
end;
$$;

revoke all on function public.begin_push_delivery(uuid[], uuid[]),
  public.renew_push_outbox_lease(uuid, uuid, integer),
  public.renew_push_receipt_lease(uuid, uuid, integer),
  public.claim_push_outbox(integer, integer),
  public.record_push_ticket(uuid, uuid, text, text),
  public.claim_push_receipts(integer, integer),
  public.record_push_receipt(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.begin_push_delivery(uuid[], uuid[]),
  public.renew_push_outbox_lease(uuid, uuid, integer),
  public.renew_push_receipt_lease(uuid, uuid, integer),
  public.claim_push_outbox(integer, integer),
  public.record_push_ticket(uuid, uuid, text, text),
  public.claim_push_receipts(integer, integer),
  public.record_push_receipt(uuid, uuid, text, text)
  to service_role;