create table if not exists public.care_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 2 and 100),
  specialty text not null check (length(specialty) between 2 and 100),
  bio text not null default '' check (length(bio) <= 2000),
  experience_years smallint not null check (experience_years between 0 and 60),
  fee_vnd integer not null check (fee_vnd between 0 and 50000000),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'suspended')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_provider_verified_timestamp check ((verification_status = 'verified') = (verified_at is not null))
);

create table if not exists public.care_provider_credentials (
  provider_id uuid primary key references public.care_providers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  license_number text not null check (length(license_number) between 3 and 100),
  region text not null check (length(region) between 2 and 100),
  review_status text not null default 'pending' check (review_status in ('pending', 'verified', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_provider_credentials_owner_unique unique (user_id),
  constraint care_provider_credentials_verified_timestamp check ((review_status = 'verified') = (reviewed_at is not null))
);

create table if not exists public.provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.care_providers (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'reserved', 'booked', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_availability_duration check (
    ends_at - starts_at = interval '30 minutes'
    and extract(minute from starts_at) in (0, 30)
    and extract(second from starts_at) = 0
    and extract(second from ends_at) = 0
  ),
  constraint provider_availability_unique_start unique (provider_id, starts_at)
);

create index if not exists provider_availability_open_by_provider on public.provider_availability (provider_id, starts_at) where status = 'open';

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_user_id uuid not null references auth.users (id) on delete cascade,
  provider_id uuid references public.care_providers (id) on delete set null,
  slot_id uuid references public.provider_availability (id) on delete set null,
  provider_name text not null check (length(provider_name) between 2 and 100),
  provider_specialty text not null check (length(provider_specialty) between 2 and 100),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fee_vnd integer not null check (fee_vnd between 0 and 50000000),
  currency text not null default 'VND' check (currency = 'VND'),
  status text not null check (status in ('awaiting_payment', 'confirmed', 'completed', 'cancelled', 'expired')),
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  patient_name text not null check (length(patient_name) between 2 and 100),
  patient_phone text not null check (patient_phone ~ '^\+[1-9][0-9]{7,14}$'),
  symptom_note text not null default '' check (length(symptom_note) <= 1000),
  provider_sharing_accepted boolean not null check (provider_sharing_accepted),
  provider_sharing_version text not null default 'provider-booking-sharing-v1',
  provider_sharing_accepted_at timestamptz not null default now(),
  hold_expires_at timestamptz,
  cancellation_reason text check (cancellation_reason in ('schedule-change', 'illness', 'other')),
  cancellation_note text not null default '' check (length(cancellation_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_patient_request_unique unique (patient_user_id, request_key),
  constraint appointments_hold_state check ((status = 'awaiting_payment') = (hold_expires_at is not null)),
  constraint appointments_duration check (ends_at - starts_at = interval '30 minutes')
);

create index if not exists appointments_patient_schedule on public.appointments (patient_user_id, starts_at desc, id desc);
create index if not exists appointments_provider_schedule on public.appointments (provider_id, starts_at desc, id desc);
create index if not exists appointments_expiring_holds on public.appointments (provider_id, slot_id, hold_expires_at) where status = 'awaiting_payment';

create or replace function public.set_care_booking_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger care_providers_set_updated_at before update on public.care_providers
for each row execute function public.set_care_booking_updated_at();
create trigger care_provider_credentials_set_updated_at before update on public.care_provider_credentials
for each row execute function public.set_care_booking_updated_at();
create trigger provider_availability_set_updated_at before update on public.provider_availability
for each row execute function public.set_care_booking_updated_at();
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_care_booking_updated_at();
revoke all on function public.set_care_booking_updated_at() from public, anon, authenticated;

create or replace function public.validate_provider_availability_slot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.starts_at <= now() or new.starts_at > now() + interval '90 days'
    or extract(minute from new.starts_at) not in (0, 30)
    or extract(second from new.starts_at) <> 0
    or new.ends_at - new.starts_at <> interval '30 minutes' then
    raise exception using errcode = '22023', message = 'INVALID_AVAILABILITY_SLOT';
  end if;
  return new;
end;
$$;

create trigger provider_availability_validate_slot before insert on public.provider_availability
for each row execute function public.validate_provider_availability_slot();
revoke all on function public.validate_provider_availability_slot() from public, anon, authenticated;

create or replace function public.reset_provider_verification_on_credential_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.license_number is distinct from old.license_number or new.region is distinct from old.region then
    new.review_status := 'pending';
    new.reviewed_at := null;
    update public.care_providers set verification_status = 'pending', verified_at = null where id = new.provider_id;
  end if;
  return new;
end;
$$;

create trigger care_provider_credentials_reset_review
before update on public.care_provider_credentials
for each row execute function public.reset_provider_verification_on_credential_change();
revoke all on function public.reset_provider_verification_on_credential_change() from public, anon, authenticated;

alter table public.care_providers enable row level security;
alter table public.care_provider_credentials enable row level security;
alter table public.provider_availability enable row level security;
alter table public.appointments enable row level security;

revoke all on public.care_providers, public.care_provider_credentials, public.provider_availability, public.appointments from anon, authenticated;
grant select on public.care_providers to authenticated;
grant insert (user_id, display_name, specialty, bio, experience_years, fee_vnd) on public.care_providers to authenticated;
grant update (display_name, specialty, bio, experience_years, fee_vnd) on public.care_providers to authenticated;
grant select on public.care_provider_credentials to authenticated;
grant insert (provider_id, user_id, license_number, region) on public.care_provider_credentials to authenticated;
grant update (license_number, region) on public.care_provider_credentials to authenticated;
grant select on public.provider_availability to authenticated;
grant insert (provider_id, starts_at, ends_at) on public.provider_availability to authenticated;
grant delete on public.provider_availability to authenticated;
grant select on public.appointments to authenticated;

create or replace function public.has_current_care_consent(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = auth.uid() and exists (
    select 1 from (
      select consent.version, consent.choices
      from public.consent_records consent
      where consent.user_id = p_user_id
      order by consent.accepted_at desc, consent.id desc
      limit 1
    ) latest
    where latest.version = '2026-11-24-v1'
      and latest.choices->>'profile_processing' = 'true'
      and latest.choices->>'nutrition_processing' = 'true'
      and latest.choices->>'data_lifecycle' = 'true'
  );
$$;
revoke all on function public.has_current_care_consent(uuid) from public, anon;
grant execute on function public.has_current_care_consent(uuid) to authenticated;

create policy care_providers_verified_directory on public.care_providers
  for select to authenticated using (
    user_id = (select auth.uid())
    or (verification_status = 'verified' and (select public.has_current_care_consent((select auth.uid()))))
  );
create policy care_providers_insert_pending_self on public.care_providers
  for insert to authenticated with check (user_id = (select auth.uid()) and verification_status = 'pending');
create policy care_providers_update_self on public.care_providers
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy care_provider_credentials_select_self on public.care_provider_credentials
  for select to authenticated using (user_id = (select auth.uid()));
create policy care_provider_credentials_insert_self on public.care_provider_credentials
  for insert to authenticated with check (user_id = (select auth.uid()) and review_status = 'pending'
    and exists (select 1 from public.care_providers provider where provider.id = provider_id and provider.user_id = (select auth.uid())));
create policy care_provider_credentials_update_self on public.care_provider_credentials
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy provider_availability_read_open_or_self on public.provider_availability
  for select to authenticated using (
    exists (select 1 from public.care_providers provider where provider.id = provider_id and provider.user_id = (select auth.uid()))
    or (status = 'open' and exists (
      select 1 from public.care_providers provider where provider.id = provider_availability.provider_id and provider.verification_status = 'verified'
    ) and (select public.has_current_care_consent((select auth.uid()))))
  );
create policy provider_availability_insert_verified_self on public.provider_availability
  for insert to authenticated with check (status = 'open' and (select public.has_current_care_consent((select auth.uid()))) and exists (
    select 1 from public.care_providers provider where provider.id = provider_id and provider.user_id = (select auth.uid()) and provider.verification_status = 'verified'
  ));
create policy provider_availability_delete_open_self on public.provider_availability
  for delete to authenticated using (status = 'open' and (select public.has_current_care_consent((select auth.uid()))) and exists (
    select 1 from public.care_providers provider where provider.id = provider_id and provider.user_id = (select auth.uid()) and provider.verification_status = 'verified'
  ));
create policy appointments_patient_or_provider_read on public.appointments
  for select to authenticated using (
    patient_user_id = (select auth.uid())
    or (status in ('confirmed', 'completed', 'cancelled') and exists (
      select 1 from public.care_providers provider where provider.id = appointments.provider_id and provider.user_id = (select auth.uid())
    ) and (select public.has_current_care_consent((select auth.uid()))))
  );

create or replace function public.assert_current_care_consent(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_current_care_consent(p_user_id) then
    raise exception using errcode = '42501', message = 'CURRENT_CONSENT_REQUIRED';
  end if;
end;
$$;

create or replace function public.release_expired_appointment_holds(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_provider_id is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not exists (select 1 from public.care_providers provider where provider.id = p_provider_id and provider.verification_status = 'verified') then
    raise exception using errcode = 'P0002', message = 'VERIFIED_PROVIDER_NOT_FOUND';
  end if;
  update public.appointments appointment
  set status = 'expired', hold_expires_at = null
  where appointment.provider_id = p_provider_id and appointment.status = 'awaiting_payment' and appointment.hold_expires_at <= now();
  update public.provider_availability slot
  set status = 'open'
  where slot.provider_id = p_provider_id and slot.status = 'reserved'
    and not exists (select 1 from public.appointments appointment where appointment.slot_id = slot.id and appointment.status = 'awaiting_payment');
end;
$$;

create or replace function public.create_appointment_hold(
  p_provider_id uuid,
  p_slot_id uuid,
  p_request_key text,
  p_request_hash text,
  p_patient_name text,
  p_patient_phone text,
  p_symptom_note text,
  p_provider_sharing_accepted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient uuid := auth.uid();
  v_slot public.provider_availability%rowtype;
  v_provider public.care_providers%rowtype;
  v_existing public.appointments%rowtype;
  v_appointment_id uuid;
begin
  if v_patient is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_patient);
  if p_provider_id is null or p_slot_id is null
    or p_request_key is null or p_request_key !~ '^[A-Za-z0-9_.:-]{8,128}$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_patient_name is null or length(p_patient_name) not between 2 and 100
    or p_patient_phone is null or p_patient_phone !~ '^\+[1-9][0-9]{7,14}$'
    or p_symptom_note is null or length(p_symptom_note) > 1000
    or p_provider_sharing_accepted is distinct from true then
    raise exception using errcode = '22023', message = 'INVALID_APPOINTMENT_REQUEST';
  end if;

  perform 1 from auth.users where id = v_patient for update;
  select * into v_existing from public.appointments where patient_user_id = v_patient and request_key = p_request_key;
  if found then
    if v_existing.request_hash <> p_request_hash then raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT'; end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  perform public.release_expired_appointment_holds(p_provider_id);
  select * into v_provider from public.care_providers where id = p_provider_id and verification_status = 'verified';
  if not found then raise exception using errcode = 'P0002', message = 'VERIFIED_PROVIDER_NOT_FOUND'; end if;
  select * into v_slot from public.provider_availability where id = p_slot_id and provider_id = p_provider_id for update;
  if not found or v_slot.status <> 'open' or v_slot.starts_at <= now() then
    raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
  end if;
  insert into public.appointments (
    patient_user_id, provider_id, slot_id, provider_name, provider_specialty, starts_at, ends_at,
    fee_vnd, currency, status, request_key, request_hash, patient_name, patient_phone,
    symptom_note, provider_sharing_accepted, provider_sharing_version, provider_sharing_accepted_at, hold_expires_at
  ) values (
    v_patient, v_provider.id, v_slot.id, v_provider.display_name, v_provider.specialty, v_slot.starts_at, v_slot.ends_at,
    v_provider.fee_vnd, 'VND', 'awaiting_payment', p_request_key, p_request_hash, p_patient_name, p_patient_phone,
    p_symptom_note, true, 'provider-booking-sharing-v1', now(), now() + interval '20 minutes'
  ) returning id into v_appointment_id;
  update public.provider_availability set status = 'reserved' where id = v_slot.id and status = 'open';
  if not found then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;
  return jsonb_build_object('id', v_appointment_id, 'replayed', false);
end;
$$;

create or replace function public.cancel_care_appointment(
  p_appointment_id uuid,
  p_reason text,
  p_note text,
  p_expected_actor text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_actor text;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  if p_appointment_id is null or p_reason is null or p_reason not in ('schedule-change', 'illness', 'other')
    or p_expected_actor is null or p_expected_actor not in ('patient', 'provider') or length(coalesce(p_note, '')) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_CANCELLATION';
  end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.patient_user_id = v_user then v_actor := 'patient';
  elsif exists (select 1 from public.care_providers provider where provider.id = v_appointment.provider_id and provider.user_id = v_user and provider.verification_status = 'verified') then v_actor := 'provider';
  else raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_OWNED'; end if;
  if v_actor is distinct from p_expected_actor then raise exception using errcode = '42501', message = 'APPOINTMENT_ACTOR_MISMATCH'; end if;
  if (v_actor = 'patient' and v_appointment.status not in ('awaiting_payment', 'confirmed'))
    or (v_actor = 'provider' and v_appointment.status <> 'confirmed') then
    raise exception using errcode = '55000', message = 'APPOINTMENT_NOT_CANCELLABLE';
  end if;
  if v_actor = 'patient' and v_appointment.status = 'confirmed' and v_appointment.starts_at < now() + interval '24 hours' then
    raise exception using errcode = '55000', message = 'CANCELLATION_WINDOW_CLOSED';
  end if;
  update public.appointments set status = 'cancelled', hold_expires_at = null,
    cancellation_reason = p_reason, cancellation_note = coalesce(p_note, '') where id = v_appointment.id;
  if v_appointment.slot_id is not null and v_appointment.starts_at > now() then
    update public.provider_availability set status = 'open' where id = v_appointment.slot_id and status in ('reserved', 'booked');
  end if;
  return v_actor;
end;
$$;

create or replace function public.complete_care_appointment(p_appointment_id uuid)
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
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found or not exists (
    select 1 from public.care_providers provider where provider.id = v_appointment.provider_id and provider.user_id = v_user and provider.verification_status = 'verified'
  ) then raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_OWNED'; end if;
  if v_appointment.status <> 'confirmed' or v_appointment.starts_at > now() then
    raise exception using errcode = '55000', message = 'APPOINTMENT_NOT_COMPLETABLE';
  end if;
  update public.appointments set status = 'completed', hold_expires_at = null where id = v_appointment.id;
  update public.provider_availability set status = 'booked' where id = v_appointment.slot_id;
end;
$$;

revoke all on function public.assert_current_care_consent(uuid) from public, anon, authenticated;
revoke all on function public.release_expired_appointment_holds(uuid) from public, anon;
grant execute on function public.release_expired_appointment_holds(uuid) to authenticated;
revoke all on function public.create_appointment_hold(uuid, uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.create_appointment_hold(uuid, uuid, text, text, text, text, text, boolean) to authenticated;
revoke all on function public.cancel_care_appointment(uuid, text, text, text) from public, anon;
grant execute on function public.cancel_care_appointment(uuid, text, text, text) to authenticated;
revoke all on function public.complete_care_appointment(uuid) from public, anon;
grant execute on function public.complete_care_appointment(uuid) to authenticated;
