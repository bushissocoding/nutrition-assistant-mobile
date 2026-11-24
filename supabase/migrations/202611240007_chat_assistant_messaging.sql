create table if not exists public.assistant_ai_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (version = 'ai-assistant-processing-v1'),
  choice text not null check (choice in ('accepted', 'withdrawn')),
  recorded_at timestamptz not null default now()
);

create index if not exists assistant_ai_consents_latest on public.assistant_ai_consents (user_id, recorded_at desc, id desc);

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_threads_one_per_owner unique (user_id),
  unique (id, user_id)
);

create table if not exists public.assistant_turns (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  request_key uuid not null,
  user_message text not null check (length(btrim(user_message)) between 1 and 2000),
  assistant_message text check (assistant_message is null or length(btrim(assistant_message)) between 1 and 4000),
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistant_turns_thread_owner foreign key (thread_id, user_id)
    references public.assistant_threads (id, user_id) on delete cascade,
  constraint assistant_turns_request_unique unique (user_id, request_key),
  constraint assistant_turns_response_state check ((status = 'completed') = (assistant_message is not null))
);

create index if not exists assistant_turns_history on public.assistant_turns (thread_id, created_at desc, id desc);

create table if not exists public.appointment_messages (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  client_message_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint appointment_messages_request_unique unique (appointment_id, sender_user_id, client_message_id)
);

create index if not exists appointment_messages_history on public.appointment_messages (appointment_id, created_at desc, id desc);

alter table public.assistant_ai_consents enable row level security;
alter table public.assistant_threads enable row level security;
alter table public.assistant_turns enable row level security;
alter table public.appointment_messages enable row level security;

revoke all on public.assistant_ai_consents, public.assistant_threads, public.assistant_turns, public.appointment_messages from anon, authenticated;
grant select on public.assistant_ai_consents, public.assistant_threads, public.assistant_turns, public.appointment_messages to authenticated;

create policy assistant_ai_consents_select_own on public.assistant_ai_consents
  for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_threads_select_own on public.assistant_threads
  for select to authenticated using (user_id = (select auth.uid()));
create policy assistant_turns_select_own on public.assistant_turns
  for select to authenticated using (user_id = (select auth.uid()));
create policy appointment_messages_select_participant on public.appointment_messages
  for select to authenticated using (exists (
    select 1 from public.appointments appointment
    where appointment.id = appointment_messages.appointment_id
      and (appointment.patient_user_id = (select auth.uid()) or exists (
        select 1 from public.care_providers provider
        where provider.id = appointment.provider_id and provider.user_id = (select auth.uid())
      ))
  ));

create or replace function public.get_or_create_assistant_thread()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_thread public.assistant_threads%rowtype;
  v_latest_choice text;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  perform 1 from auth.users where id = v_user for update;
  insert into public.assistant_threads (user_id) values (v_user)
    on conflict (user_id) do update set updated_at = public.assistant_threads.updated_at
    returning * into v_thread;
  select consent.choice into v_latest_choice from public.assistant_ai_consents consent
    where consent.user_id = v_user order by consent.recorded_at desc, consent.id desc limit 1;
  return jsonb_build_object('threadId', v_thread.id, 'aiConsent', coalesce(v_latest_choice = 'accepted', false));
end;
$$;

create or replace function public.record_assistant_ai_consent(p_version text, p_accepted boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_choice text;
  v_record public.assistant_ai_consents%rowtype;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  perform 1 from auth.users where id = v_user for update;
  if p_version is distinct from 'ai-assistant-processing-v1' or p_accepted is null then
    raise exception using errcode = '22023', message = 'INVALID_AI_ASSISTANT_CONSENT';
  end if;
  v_choice := case when p_accepted then 'accepted' else 'withdrawn' end;
  insert into public.assistant_ai_consents (user_id, version, choice) values (v_user, p_version, v_choice)
    returning * into v_record;
  return jsonb_build_object('version', v_record.version, 'accepted', v_record.choice = 'accepted', 'recordedAt', v_record.recorded_at);
end;
$$;

create or replace function public.begin_assistant_turn(p_request_key uuid, p_user_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_thread public.assistant_threads%rowtype;
  v_turn public.assistant_turns%rowtype;
  v_latest_choice text;
  v_replayed boolean := false;
  v_generate boolean := false;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  if p_request_key is null or p_user_message is null or length(btrim(p_user_message)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_ASSISTANT_TURN';
  end if;
  perform 1 from auth.users where id = v_user for update;
  select consent.choice into v_latest_choice from public.assistant_ai_consents consent
    where consent.user_id = v_user order by consent.recorded_at desc, consent.id desc limit 1;
  if v_latest_choice is distinct from 'accepted' then
    raise exception using errcode = '42501', message = 'AI_ASSISTANT_CONSENT_REQUIRED';
  end if;
  insert into public.assistant_threads (user_id) values (v_user)
    on conflict (user_id) do update set updated_at = now()
    returning * into v_thread;
  select * into v_turn from public.assistant_turns
    where user_id = v_user and request_key = p_request_key for update;
  if found then
    if v_turn.user_message <> btrim(p_user_message) then raise exception using errcode = '23505', message = 'ASSISTANT_IDEMPOTENCY_CONFLICT'; end if;
    v_replayed := true;
    if v_turn.status = 'failed' then
      update public.assistant_turns set status = 'pending', assistant_message = null, updated_at = now()
        where id = v_turn.id returning * into v_turn;
      v_generate := true;
    elsif v_turn.status = 'pending' and v_turn.updated_at < now() - interval '2 minutes' then
      update public.assistant_turns set updated_at = now() where id = v_turn.id returning * into v_turn;
      v_generate := true;
    end if;
  else
    insert into public.assistant_turns (thread_id, user_id, request_key, user_message)
      values (v_thread.id, v_user, p_request_key, btrim(p_user_message)) returning * into v_turn;
    v_generate := true;
  end if;
  update public.assistant_threads set updated_at = now() where id = v_thread.id;
  return jsonb_build_object(
    'threadId', v_thread.id,
    'turn', jsonb_build_object('id', v_turn.id, 'requestKey', v_turn.request_key, 'userMessage', v_turn.user_message,
      'assistantMessage', v_turn.assistant_message, 'status', v_turn.status, 'createdAt', v_turn.created_at),
    'replayed', v_replayed,
    'shouldGenerate', v_generate
  );
end;
$$;

create or replace function public.complete_assistant_turn(p_turn_id uuid, p_assistant_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_turn public.assistant_turns%rowtype;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_turn_id is null or p_assistant_message is null or length(btrim(p_assistant_message)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'INVALID_ASSISTANT_RESPONSE';
  end if;
  update public.assistant_turns set assistant_message = btrim(p_assistant_message), status = 'completed', updated_at = now()
    where id = p_turn_id and user_id = v_user and status = 'pending' returning * into v_turn;
  if not found then
    select * into v_turn from public.assistant_turns where id = p_turn_id and user_id = v_user;
    if not found then raise exception using errcode = 'P0002', message = 'ASSISTANT_TURN_NOT_FOUND'; end if;
    if v_turn.status <> 'completed' or v_turn.assistant_message <> btrim(p_assistant_message) then
      raise exception using errcode = '55000', message = 'ASSISTANT_TURN_STATE_CONFLICT';
    end if;
  end if;
  return jsonb_build_object('id', v_turn.id, 'requestKey', v_turn.request_key, 'userMessage', v_turn.user_message,
    'assistantMessage', v_turn.assistant_message, 'status', v_turn.status, 'createdAt', v_turn.created_at);
end;
$$;

create or replace function public.fail_assistant_turn(p_turn_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  update public.assistant_turns set status = 'failed', updated_at = now()
    where id = p_turn_id and user_id = auth.uid() and status = 'pending';
end;
$$;

create or replace function public.send_appointment_message(p_appointment_id uuid, p_client_message_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_message public.appointment_messages%rowtype;
  v_replayed boolean := false;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_current_care_consent(v_user);
  if p_appointment_id is null or p_client_message_id is null or p_body is null or length(btrim(p_body)) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'INVALID_APPOINTMENT_MESSAGE';
  end if;
  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if v_appointment.status not in ('confirmed', 'completed') then
    raise exception using errcode = '55000', message = 'APPOINTMENT_CHAT_UNAVAILABLE';
  end if;
  if v_appointment.patient_user_id <> v_user and not exists (
    select 1 from public.care_providers provider where provider.id = v_appointment.provider_id
      and provider.user_id = v_user and provider.verification_status = 'verified'
  ) then raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_OWNED'; end if;
  insert into public.appointment_messages (appointment_id, sender_user_id, client_message_id, body)
    values (p_appointment_id, v_user, p_client_message_id, btrim(p_body))
    on conflict (appointment_id, sender_user_id, client_message_id) do nothing returning * into v_message;
  if not found then
    select * into v_message from public.appointment_messages
      where appointment_id = p_appointment_id and sender_user_id = v_user and client_message_id = p_client_message_id;
    if v_message.body <> btrim(p_body) then raise exception using errcode = '23505', message = 'APPOINTMENT_MESSAGE_IDEMPOTENCY_CONFLICT'; end if;
    v_replayed := true;
  end if;
  return jsonb_build_object('message', jsonb_build_object('id', v_message.id, 'appointmentId', v_message.appointment_id,
    'senderUserId', v_message.sender_user_id, 'clientMessageId', v_message.client_message_id, 'body', v_message.body, 'createdAt', v_message.created_at),
    'replayed', v_replayed);
end;
$$;

revoke all on function public.get_or_create_assistant_thread() from public, anon;
grant execute on function public.get_or_create_assistant_thread() to authenticated;
revoke all on function public.record_assistant_ai_consent(text, boolean) from public, anon;
grant execute on function public.record_assistant_ai_consent(text, boolean) to authenticated;
revoke all on function public.begin_assistant_turn(uuid, text) from public, anon;
grant execute on function public.begin_assistant_turn(uuid, text) to authenticated;
revoke all on function public.complete_assistant_turn(uuid, text) from public, anon;
grant execute on function public.complete_assistant_turn(uuid, text) to authenticated;
revoke all on function public.fail_assistant_turn(uuid) from public, anon;
grant execute on function public.fail_assistant_turn(uuid) to authenticated;
revoke all on function public.send_appointment_message(uuid, uuid, text) from public, anon;
grant execute on function public.send_appointment_message(uuid, uuid, text) to authenticated;
