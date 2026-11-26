create table if not exists public.health_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_key uuid not null default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  source_date date,
  note text not null default '' check (length(note) <= 1000),
  file_path text,
  file_mime_type text check (file_mime_type is null or file_mime_type in ('image/jpeg', 'image/png')),
  file_size bigint check (file_size is null or file_size between 1 and 8388608),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_record_file_metadata check ((file_path is null and file_mime_type is null and file_size is null)
    or (file_path = user_id::text || '/' || id::text and file_mime_type is not null and file_size is not null)),
  constraint health_records_owner_id_unique unique (id, user_id),
  constraint health_records_request_unique unique (user_id, request_key)
);

create index if not exists health_records_owner_history on public.health_records (user_id, source_date desc nulls last, created_at desc, id desc);

create table if not exists public.health_record_results (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100),
  value text not null check (length(btrim(value)) between 1 and 100),
  unit text not null default '' check (length(unit) <= 40),
  reference_range text not null default '' check (length(reference_range) <= 80),
  created_at timestamptz not null default now(),
  constraint health_record_result_owner foreign key (record_id, user_id)
    references public.health_records (id, user_id) on delete cascade
);

create index if not exists health_record_results_history on public.health_record_results (record_id, created_at, id);

alter table public.health_records enable row level security;
alter table public.health_record_results enable row level security;

revoke all on public.health_records, public.health_record_results from anon, authenticated;
grant select on public.health_records, public.health_record_results to authenticated;

create policy health_records_select_own on public.health_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy health_record_results_select_own on public.health_record_results
  for select to authenticated using (user_id = (select auth.uid()) and exists (
    select 1 from public.health_records record where record.id = health_record_results.record_id and record.user_id = (select auth.uid())
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('health-record-images', 'health-record-images', false, 8388608, array['image/jpeg', 'image/png'])
on conflict (id) do update set public = false, file_size_limit = 8388608, allowed_mime_types = array['image/jpeg', 'image/png'];

drop policy if exists health_record_objects_select_own on storage.objects;
create policy health_record_objects_select_own on storage.objects
  for select to authenticated using (bucket_id = 'health-record-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists health_record_objects_insert_own on storage.objects;
create policy health_record_objects_insert_own on storage.objects
  for insert to authenticated with check (bucket_id = 'health-record-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists health_record_objects_update_own on storage.objects;
create policy health_record_objects_update_own on storage.objects
  for update to authenticated using (bucket_id = 'health-record-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'health-record-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists health_record_objects_delete_own on storage.objects;
create policy health_record_objects_delete_own on storage.objects
  for delete to authenticated using (bucket_id = 'health-record-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.assert_health_record_consent(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_choices jsonb;
begin
  perform public.assert_current_care_consent(p_user_id);
  select choices into v_choices from public.consent_records
    where user_id = p_user_id order by accepted_at desc, id desc limit 1;
  if coalesce(v_choices ->> 'health_record_storage', 'false') <> 'true' then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_CONSENT_REQUIRED';
  end if;
end;
$$;

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
    if jsonb_typeof(v_candidate) <> 'object' or jsonb_object_length(v_candidate) <> 5
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

create or replace function public.attach_health_record_source(p_record_id uuid, p_file_path text, p_mime_type text, p_file_size bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_health_record_consent(v_user);
  if p_record_id is null or p_file_path is distinct from v_user::text || '/' || p_record_id::text
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png')
    or p_file_size is null or p_file_size not between 1 and 8388608 then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_SOURCE';
  end if;
  update public.health_records set file_path = p_file_path, file_mime_type = p_mime_type, file_size = p_file_size, updated_at = now()
    where id = p_record_id and user_id = v_user;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
end;
$$;

create or replace function public.delete_health_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  delete from public.health_records where id = p_record_id and user_id = auth.uid();
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.assert_health_record_consent(uuid) from public, anon, authenticated;
revoke all on function public.save_health_record(uuid, uuid, text, date, text, jsonb) from public, anon;
grant execute on function public.save_health_record(uuid, uuid, text, date, text, jsonb) to authenticated;
revoke all on function public.attach_health_record_source(uuid, text, text, bigint) from public, anon;
grant execute on function public.attach_health_record_source(uuid, text, text, bigint) to authenticated;
revoke all on function public.delete_health_record(uuid) from public, anon;
grant execute on function public.delete_health_record(uuid) to authenticated;
