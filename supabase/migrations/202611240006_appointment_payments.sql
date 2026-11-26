create sequence if not exists public.appointment_payment_order_code_seq
  as bigint start with 1800000000 increment by 1 minvalue 1 maxvalue 2147483647 no cycle;

create table if not exists public.appointment_payments (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments (id) on delete cascade,
  patient_user_id uuid not null references auth.users (id) on delete cascade,
  order_code bigint not null unique check (order_code between 1 and 2147483647),
  amount_vnd integer not null check (amount_vnd between 1 and 50000000),
  currency text not null default 'VND' check (currency = 'VND'),
  status text not null check (status in ('creating_link', 'pending', 'paid', 'cancelled', 'expired', 'failed', 'reconciliation_required')),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  payment_link_id text unique check (payment_link_id is null or length(payment_link_id) between 1 and 128),
  checkout_url text check (checkout_url is null or checkout_url ~ '^https://pay\.payos\.vn/web/'),
  qr_code text check (qr_code is null or length(qr_code) <= 2000),
  provider_reference text,
  provider_transaction_at text,
  link_created_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointment_payment_link_state check (
    (status = 'creating_link' and payment_link_id is null and checkout_url is null)
    or (status in ('reconciliation_required', 'cancelled', 'expired') and ((payment_link_id is null and checkout_url is null) or (payment_link_id is not null and checkout_url is not null)))
    or (status in ('pending', 'paid', 'failed') and payment_link_id is not null and checkout_url is not null)
  ),
  constraint appointment_payment_paid_timestamp check ((status = 'paid') = (paid_at is not null))
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.appointment_payments (id) on delete cascade,
  event_key text not null unique check (event_key ~ '^[a-f0-9]{64}$'),
  order_code bigint not null,
  payment_link_id text not null check (length(payment_link_id) between 1 and 128),
  provider_reference text not null check (length(provider_reference) between 1 and 128),
  amount_vnd integer not null check (amount_vnd between 1 and 50000000),
  currency text not null check (currency = 'VND'),
  event_code text not null check (length(event_code) between 1 and 32),
  outcome text not null check (outcome in ('paid', 'not_successful', 'duplicate', 'unmatched', 'mismatch', 'late_payment')),
  received_at timestamptz not null default now()
);

create index if not exists appointment_payments_owner_history on public.appointment_payments (patient_user_id, created_at desc, id desc);
create index if not exists payment_webhook_events_order_code on public.payment_webhook_events (order_code, received_at desc);
create index if not exists payment_webhook_events_payment_id on public.payment_webhook_events (payment_id, received_at desc) where payment_id is not null;

alter table public.appointment_payments enable row level security;
alter table public.payment_webhook_events enable row level security;
revoke all on public.appointment_payments, public.payment_webhook_events from anon, authenticated;
grant select on public.appointment_payments to authenticated;
create policy appointment_payments_select_own on public.appointment_payments
  for select to authenticated using (patient_user_id = (select auth.uid()));

create or replace function public.create_appointment_payment_intent(p_appointment_id uuid, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_payment public.appointment_payments%rowtype;
  v_replayed boolean := false;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  if p_appointment_id is null or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9_.:-]{8,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_INTENT';
  end if;
  select * into v_appointment from public.appointments
    where id = p_appointment_id and patient_user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.status <> 'awaiting_payment' or v_appointment.hold_expires_at <= now() then
    raise exception using errcode = '55000', message = 'APPOINTMENT_PAYMENT_WINDOW_CLOSED';
  end if;
  if v_appointment.fee_vnd < 1 then raise exception using errcode = '22023', message = 'INVALID_PAYMENT_AMOUNT'; end if;
  select * into v_payment from public.appointment_payments where appointment_id = v_appointment.id for update;
  if found then
    if v_payment.patient_user_id <> v_user or v_payment.idempotency_key <> p_idempotency_key then
      raise exception using errcode = '23505', message = 'PAYMENT_IDEMPOTENCY_CONFLICT';
    end if;
    v_replayed := true;
  else
    insert into public.appointment_payments (appointment_id, patient_user_id, order_code, amount_vnd, status, idempotency_key)
    values (v_appointment.id, v_user, nextval('public.appointment_payment_order_code_seq'), v_appointment.fee_vnd, 'creating_link', p_idempotency_key)
    returning * into v_payment;
  end if;
  return jsonb_build_object(
    'payment', jsonb_build_object('id', v_payment.id, 'appointmentId', v_payment.appointment_id, 'orderCode', v_payment.order_code,
      'amount', jsonb_build_object('value', v_payment.amount_vnd, 'currency', v_payment.currency), 'status', v_payment.status,
      'paymentLinkId', v_payment.payment_link_id, 'checkoutUrl', v_payment.checkout_url, 'qrCode', v_payment.qr_code,
      'providerReference', v_payment.provider_reference, 'paidAt', v_payment.paid_at, 'createdAt', v_payment.created_at,
      'updatedAt', v_payment.updated_at, 'holdExpiresAt', v_appointment.hold_expires_at),
    'replayed', v_replayed
  );
end;
$$;

create or replace function public.expire_own_appointment_payment_hold(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_appointment public.appointments%rowtype;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  select * into v_appointment from public.appointments where id = p_appointment_id and patient_user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.status = 'awaiting_payment' and v_appointment.hold_expires_at <= now() then
    update public.appointments set status = 'expired', hold_expires_at = null where id = v_appointment.id;
    update public.provider_availability slot set status = 'open'
      where slot.id = v_appointment.slot_id and slot.status = 'reserved'
        and not exists (select 1 from public.appointments appointment where appointment.slot_id = slot.id and appointment.status = 'awaiting_payment');
  end if;
end;
$$;

create or replace function public.finish_appointment_payment_link(
  p_payment_id uuid, p_payment_link_id text, p_checkout_url text, p_qr_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.appointment_payments%rowtype;
begin
  if p_payment_id is null or p_payment_link_id is null or length(p_payment_link_id) not between 1 and 128
    or p_checkout_url is null or p_checkout_url !~ '^https://pay\.payos\.vn/web/'
    or length(coalesce(p_qr_code, '')) > 2000 then
    raise exception using errcode = '22023', message = 'INVALID_PAYMENT_LINK';
  end if;
  select * into v_payment from public.appointment_payments where id = p_payment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'creating_link' then raise exception using errcode = '55000', message = 'PAYMENT_LINK_STATE_CONFLICT'; end if;
  update public.appointment_payments set status = 'pending', payment_link_id = p_payment_link_id,
    checkout_url = p_checkout_url, qr_code = nullif(p_qr_code, ''), link_created_at = now()
    where id = p_payment_id;
end;
$$;

create or replace function public.mark_appointment_payment_reconciliation(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appointment_payments set status = 'reconciliation_required'
  where id = p_payment_id and status = 'creating_link';
end;
$$;

create or replace function public.get_cancelled_appointment_payment_link(p_appointment_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('orderCode', payment.order_code, 'paymentLinkId', payment.payment_link_id)
  from public.appointment_payments payment
  where payment.appointment_id = p_appointment_id and payment.status = 'cancelled'
    and payment.payment_link_id is not null and payment.checkout_url is not null;
$$;

create or replace function public.process_payos_payment_event(
  p_event_key text,
  p_order_code bigint,
  p_payment_link_id text,
  p_reference text,
  p_amount_vnd integer,
  p_currency text,
  p_event_code text,
  p_success boolean,
  p_transaction_at text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.appointment_payments%rowtype;
  v_appointment public.appointments%rowtype;
  v_event_id uuid;
  v_outcome text;
begin
  if p_event_key is null or p_event_key !~ '^[a-f0-9]{64}$' or p_order_code is null or p_order_code not between 1 and 2147483647
    or p_payment_link_id is null or length(p_payment_link_id) not between 1 and 128
    or p_reference is null or length(p_reference) not between 1 and 128
    or p_amount_vnd is null or p_amount_vnd not between 1 and 50000000 or p_currency <> 'VND'
    or p_event_code is null or length(p_event_code) not between 1 and 32 or p_success is null
    or length(coalesce(p_transaction_at, '')) > 64 then
    raise exception using errcode = '22023', message = 'INVALID_VERIFIED_PAYMENT_EVENT';
  end if;
  insert into public.payment_webhook_events (event_key, order_code, payment_link_id, provider_reference, amount_vnd, currency, event_code, outcome)
  values (p_event_key, p_order_code, p_payment_link_id, p_reference, p_amount_vnd, p_currency, p_event_code, 'unmatched')
  on conflict (event_key) do nothing returning id into v_event_id;
  if not found then return 'duplicate'; end if;
  select * into v_payment from public.appointment_payments where order_code = p_order_code;
  if not found then
    v_outcome := 'unmatched';
  else
    select * into v_appointment from public.appointments where id = v_payment.appointment_id for update;
    if not found then
      v_outcome := 'unmatched';
    else
      select * into v_payment from public.appointment_payments where id = v_payment.id for update;
      if not found then
        v_outcome := 'unmatched';
      elsif v_payment.amount_vnd <> p_amount_vnd or v_payment.currency <> p_currency or v_payment.payment_link_id is distinct from p_payment_link_id then
        if v_payment.status <> 'paid' then
          update public.appointment_payments set status = 'reconciliation_required', provider_reference = p_reference,
            provider_transaction_at = p_transaction_at where id = v_payment.id;
        end if;
        v_outcome := 'mismatch';
      elsif v_payment.status = 'paid' then
        v_outcome := 'duplicate';
      elsif not p_success then
        v_outcome := 'not_successful';
      elsif v_payment.status <> 'pending' or v_appointment.status <> 'awaiting_payment'
        or v_appointment.hold_expires_at is null or v_appointment.hold_expires_at <= now() then
        update public.appointment_payments set status = 'reconciliation_required', provider_reference = p_reference,
          provider_transaction_at = p_transaction_at where id = v_payment.id;
        v_outcome := 'late_payment';
      else
        update public.appointment_payments set status = 'paid', provider_reference = p_reference,
          provider_transaction_at = p_transaction_at, paid_at = now() where id = v_payment.id;
        update public.appointments set status = 'confirmed', hold_expires_at = null where id = v_appointment.id;
        update public.provider_availability set status = 'booked'
          where id = v_appointment.slot_id and status = 'reserved';
        if not found then raise exception using errcode = '55000', message = 'PAYMENT_SLOT_STATE_CONFLICT'; end if;
        v_outcome := 'paid';
      end if;
    end if;
  end if;
  update public.payment_webhook_events set payment_id = v_payment.id, outcome = v_outcome where id = v_event_id;
  return v_outcome;
end;
$$;

create or replace function public.set_appointment_payment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger appointment_payments_set_updated_at before update on public.appointment_payments
for each row execute function public.set_appointment_payment_updated_at();
revoke all on function public.set_appointment_payment_updated_at() from public, anon, authenticated;

create or replace function public.sync_appointment_payment_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and new.status in ('cancelled', 'expired') then
    update public.appointment_payments set status = new.status
    where appointment_id = new.id and status in ('creating_link', 'pending');
  end if;
  return new;
end;
$$;
create trigger appointments_sync_payment_cancellation after update of status on public.appointments
for each row execute function public.sync_appointment_payment_cancellation();
revoke all on function public.sync_appointment_payment_cancellation() from public, anon, authenticated;

revoke all on function public.create_appointment_payment_intent(uuid, text) from public, anon;
grant execute on function public.create_appointment_payment_intent(uuid, text) to authenticated;
revoke all on function public.expire_own_appointment_payment_hold(uuid) from public, anon;
grant execute on function public.expire_own_appointment_payment_hold(uuid) to authenticated;
revoke all on function public.finish_appointment_payment_link(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_appointment_payment_link(uuid, text, text, text) to service_role;
revoke all on function public.mark_appointment_payment_reconciliation(uuid) from public, anon, authenticated;
grant execute on function public.mark_appointment_payment_reconciliation(uuid) to service_role;
revoke all on function public.get_cancelled_appointment_payment_link(uuid) from public, anon, authenticated;
grant execute on function public.get_cancelled_appointment_payment_link(uuid) to service_role;
revoke all on function public.process_payos_payment_event(text, bigint, text, text, integer, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.process_payos_payment_event(text, bigint, text, text, integer, text, text, boolean, text) to service_role;
