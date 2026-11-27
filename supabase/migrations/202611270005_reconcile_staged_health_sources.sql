create table public.health_record_source_uploads (
  file_path text primary key,
  user_id uuid not null,
  record_id uuid not null,
  expected_file_path text,
  expected_source_version integer not null check (expected_source_version >= 0),
  status text not null default 'pending' check (status in ('pending', 'cancelled', 'attached')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (
    array_length(string_to_array(file_path, '/'), 1) >= 2
    and split_part(file_path, '/', 1) = user_id::text
    and split_part(file_path, '/', 2) = record_id::text
  )
);

create index health_record_source_uploads_cleanup on public.health_record_source_uploads (status, created_at, cancelled_at);
create index health_record_source_uploads_record on public.health_record_source_uploads (record_id, user_id, status);
alter table public.health_record_source_uploads enable row level security;
revoke all on public.health_record_source_uploads from public, anon, authenticated;

-- Keep the unsafe pre-versioned RPC absent even on databases that received an
-- incomplete historical migration sequence.
drop function if exists public.replace_health_record_source(uuid, text, text, text, bigint);

insert into public.health_record_source_uploads
  (file_path, user_id, record_id, expected_file_path, expected_source_version, status)
select record.file_path, record.user_id, record.id, record.file_path, record.file_source_version, 'attached'
from public.health_records record
where record.file_path is not null
on conflict (file_path) do nothing;

insert into public.health_record_source_uploads
  (file_path, user_id, record_id, expected_file_path, expected_source_version, status, cancelled_at)
select object.name, split_part(object.name, '/', 1)::uuid, split_part(object.name, '/', 2)::uuid,
  null, 0, 'cancelled', now()
from storage.objects object
where object.bucket_id = 'health-record-images' and object.id is not null
  and split_part(object.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(object.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and array_length(string_to_array(object.name, '/'), 1) >= 2
  and not exists (select 1 from public.health_records record where record.file_path = object.name)
on conflict (file_path) do nothing;

create or replace function public.can_upload_health_record_source(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_object_name is null or not public.owns_health_record_source_path(p_object_name) then return false; end if;
  perform public.assert_health_record_consent(v_user);
  return exists (
    select 1 from public.health_record_source_uploads
    where file_path = p_object_name and user_id = v_user and status = 'pending'
  );
exception when insufficient_privilege then
  return false;
end;
$$;

revoke all on function public.can_upload_health_record_source(text) from public, anon, authenticated;
grant execute on function public.can_upload_health_record_source(text) to authenticated;

-- Source images are uploaded by the API service after signature and size checks.
-- Authenticated clients can register a staged path but cannot bypass those checks.
drop policy if exists health_record_objects_insert_own on storage.objects;

create function public.require_staged_health_record_source_upload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bucket_id is distinct from 'health-record-images' then return new; end if;
  perform 1 from public.health_record_source_uploads
    where file_path = new.name and status = 'pending' for update;
  if not found then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_SOURCE_UPLOAD_NOT_STAGED';
  end if;
  return new;
end;
$$;

revoke all on function public.require_staged_health_record_source_upload() from public, anon, authenticated;
drop trigger if exists health_record_source_upload_stage_guard on storage.objects;
create trigger health_record_source_upload_stage_guard
  before insert on storage.objects
  for each row execute function public.require_staged_health_record_source_upload();

create or replace function public.begin_health_record_source_upload(
  p_record_id uuid,
  p_expected_file_path text,
  p_expected_source_version integer,
  p_file_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_file_path text;
  v_source_version integer;
  v_active_upload_count integer;
  v_existing_upload boolean;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_health_record_consent(v_user);
  if p_record_id is null or p_expected_source_version is null or p_expected_source_version < 0
    or p_file_path is null
    or array_length(string_to_array(p_file_path, '/'), 1) <> 3
    or split_part(p_file_path, '/', 1) <> v_user::text
    or split_part(p_file_path, '/', 2) <> p_record_id::text
    or split_part(p_file_path, '/', 3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_SOURCE';
  end if;

  select file_path, file_source_version into v_file_path, v_source_version
    from public.health_records where id = p_record_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
  if v_file_path is distinct from p_expected_file_path or v_source_version is distinct from p_expected_source_version then
    raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_CHANGED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select exists (
    select 1 from public.health_record_source_uploads
    where file_path = p_file_path and user_id = v_user and record_id = p_record_id
      and expected_file_path is not distinct from p_expected_file_path
      and expected_source_version = p_expected_source_version and status = 'pending'
  ) into v_existing_upload;
  if not v_existing_upload then
    select count(*)::integer into v_active_upload_count
      from public.health_record_source_uploads
      where user_id = v_user and file_path <> p_file_path and status <> 'attached';
    if v_active_upload_count >= 10 then
      raise exception using errcode = '54000', message = 'HEALTH_RECORD_SOURCE_UPLOAD_LIMIT';
    end if;
  end if;

  insert into public.health_record_source_uploads (file_path, user_id, record_id, expected_file_path, expected_source_version)
    values (p_file_path, v_user, p_record_id, p_expected_file_path, p_expected_source_version)
    on conflict (file_path) do update set status = 'pending'
    where public.health_record_source_uploads.user_id = excluded.user_id
      and public.health_record_source_uploads.record_id = excluded.record_id
      and public.health_record_source_uploads.expected_file_path is not distinct from excluded.expected_file_path
      and public.health_record_source_uploads.expected_source_version = excluded.expected_source_version
      and public.health_record_source_uploads.status = 'pending';
  if not found then raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_CHANGED'; end if;
  return true;
end;
$$;

create or replace function public.replace_health_record_source(
  p_record_id uuid,
  p_expected_file_path text,
  p_expected_source_version integer,
  p_file_path text,
  p_mime_type text,
  p_file_size bigint
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_previous_file_path text;
  v_source_version integer;
  v_upload public.health_record_source_uploads%rowtype;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_health_record_consent(v_user);
  if p_record_id is null or p_expected_source_version is null or p_expected_source_version < 0
    or p_file_path is null
    or array_length(string_to_array(p_file_path, '/'), 1) <> 3
    or split_part(p_file_path, '/', 1) <> v_user::text
    or split_part(p_file_path, '/', 2) <> p_record_id::text
    or split_part(p_file_path, '/', 3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png')
    or p_file_size is null or p_file_size not between 1 and 8388608 then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_SOURCE';
  end if;

  select file_path, file_source_version into v_previous_file_path, v_source_version
    from public.health_records where id = p_record_id and user_id = v_user for update;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;

  select * into v_upload from public.health_record_source_uploads
    where file_path = p_file_path and user_id = v_user and record_id = p_record_id for update;
  if not found or v_upload.status <> 'pending'
    or v_upload.expected_file_path is distinct from p_expected_file_path
    or v_upload.expected_source_version is distinct from p_expected_source_version then
    raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_UPLOAD_EXPIRED';
  end if;
  if v_previous_file_path is distinct from p_expected_file_path or v_source_version is distinct from p_expected_source_version then
    raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_CHANGED';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'health-record-images' and name = p_file_path
  ) then
    raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_SOURCE_UPLOAD_NOT_FOUND';
  end if;

  update public.health_records set
    file_path = p_file_path,
    file_mime_type = p_mime_type,
    file_size = p_file_size,
    file_source_version = file_source_version + 1,
    updated_at = now()
  where id = p_record_id and user_id = v_user;
  if v_previous_file_path is not null then
    update public.health_record_source_uploads set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now())
      where file_path = v_previous_file_path and user_id = v_user and record_id = p_record_id;
  end if;
  update public.health_record_source_uploads set
    status = 'attached', expected_file_path = p_file_path,
    expected_source_version = p_expected_source_version + 1, cancelled_at = null
    where file_path = p_file_path and user_id = v_user and record_id = p_record_id;
  return v_previous_file_path;
end;
$$;

create or replace function public.cancel_health_record_source_upload(
  p_record_id uuid,
  p_expected_file_path text,
  p_expected_source_version integer,
  p_staged_file_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_current_file_path text;
  v_source_version integer;
  v_upload public.health_record_source_uploads%rowtype;
  v_record_exists boolean := false;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_record_id is null or p_expected_source_version is null or p_expected_source_version < 0
    or p_staged_file_path is null
    or array_length(string_to_array(p_staged_file_path, '/'), 1) <> 3
    or split_part(p_staged_file_path, '/', 1) <> v_user::text
    or split_part(p_staged_file_path, '/', 2) <> p_record_id::text
    or split_part(p_staged_file_path, '/', 3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_SOURCE';
  end if;

  select file_path, file_source_version into v_current_file_path, v_source_version
    from public.health_records where id = p_record_id and user_id = v_user for update;
  v_record_exists := found;
  select * into v_upload from public.health_record_source_uploads
    where file_path = p_staged_file_path and user_id = v_user and record_id = p_record_id for update;

  if not found then
    if v_record_exists and v_current_file_path = p_staged_file_path then return false; end if;
    if v_record_exists and v_source_version > p_expected_source_version then return true; end if;
    if not v_record_exists then return true; end if;
    return false;
  end if;
  if v_record_exists and v_current_file_path = p_staged_file_path then return false; end if;
  if v_upload.expected_file_path is distinct from p_expected_file_path
    or v_upload.expected_source_version is distinct from p_expected_source_version then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_SOURCE_UPLOAD_FORBIDDEN';
  end if;
  if not v_record_exists then
    update public.health_record_source_uploads set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()) where file_path = p_staged_file_path;
    return true;
  end if;
  if v_upload.status = 'cancelled' or v_source_version > p_expected_source_version then
    update public.health_record_source_uploads set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()) where file_path = p_staged_file_path;
    return true;
  end if;
  if v_source_version is distinct from p_expected_source_version
    or v_current_file_path is distinct from p_expected_file_path then return false; end if;

  update public.health_records set file_source_version = file_source_version + 1, updated_at = now()
    where id = p_record_id and user_id = v_user;
  update public.health_record_source_uploads set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()) where file_path = p_staged_file_path;
  return true;
end;
$$;

create function public.claim_stale_health_record_source_uploads(p_min_age_seconds integer, p_limit integer)
returns table(file_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_current_file_path text;
  v_source_version integer;
  v_record_exists boolean;
  v_upload public.health_record_source_uploads%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_CLEANUP_REQUIRES_SERVER';
  end if;
  if p_min_age_seconds is null or p_min_age_seconds < 60 or p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_CLEANUP_LIMIT';
  end if;

  for v_candidate in
    select upload.file_path, upload.user_id, upload.record_id
    from public.health_record_source_uploads upload
    where (upload.status = 'pending' and upload.created_at <= now() - make_interval(secs => p_min_age_seconds))
      or (upload.status = 'cancelled' and upload.cancelled_at <= now() - make_interval(secs => p_min_age_seconds))
      or (upload.status = 'attached' and not exists (
        select 1 from public.health_records record
        where record.id = upload.record_id and record.user_id = upload.user_id
          and record.file_path = upload.file_path
      ))
    order by upload.created_at, upload.file_path
    limit p_limit
  loop
    select record.file_path, record.file_source_version into v_current_file_path, v_source_version
      from public.health_records record
      where record.id = v_candidate.record_id and record.user_id = v_candidate.user_id
      for update;
    v_record_exists := found;
    select * into v_upload from public.health_record_source_uploads upload
      where upload.file_path = v_candidate.file_path for update;
    if not found then continue; end if;
    if v_record_exists and v_current_file_path = v_candidate.file_path then
      if v_upload.status <> 'attached' then
        delete from public.health_record_source_uploads where public.health_record_source_uploads.file_path = v_candidate.file_path;
      end if;
      continue;
    end if;
    if v_upload.status = 'cancelled' then
      if v_upload.cancelled_at <= now() - make_interval(secs => p_min_age_seconds) then
        file_path := v_candidate.file_path;
        return next;
      end if;
      continue;
    end if;
    if v_upload.status = 'attached' then
      update public.health_record_source_uploads set status = 'cancelled', cancelled_at = now()
        where public.health_record_source_uploads.file_path = v_candidate.file_path;
      continue;
    end if;
    if not v_record_exists or v_source_version > v_upload.expected_source_version then
      update public.health_record_source_uploads set status = 'cancelled', cancelled_at = now()
        where public.health_record_source_uploads.file_path = v_candidate.file_path;
      continue;
    end if;
    if v_source_version = v_upload.expected_source_version
      and v_current_file_path is not distinct from v_upload.expected_file_path then
      update public.health_records set file_source_version = file_source_version + 1, updated_at = now()
        where id = v_candidate.record_id and user_id = v_candidate.user_id;
      update public.health_record_source_uploads set status = 'cancelled', cancelled_at = now()
        where public.health_record_source_uploads.file_path = v_candidate.file_path;
    end if;
  end loop;
end;
$$;

create function public.finish_health_record_source_uploads(p_file_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_CLEANUP_REQUIRES_SERVER';
  end if;
  if p_file_paths is null then raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_CLEANUP_PATHS'; end if;
  delete from public.health_record_source_uploads where file_path = any(p_file_paths);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.begin_health_record_source_upload(uuid, text, integer, text) from public, anon;
grant execute on function public.begin_health_record_source_upload(uuid, text, integer, text) to authenticated;
revoke all on function public.replace_health_record_source(uuid, text, integer, text, text, bigint) from public, anon;
grant execute on function public.replace_health_record_source(uuid, text, integer, text, text, bigint) to authenticated;
revoke all on function public.cancel_health_record_source_upload(uuid, text, integer, text) from public, anon;
grant execute on function public.cancel_health_record_source_upload(uuid, text, integer, text) to authenticated;
revoke all on function public.claim_stale_health_record_source_uploads(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_stale_health_record_source_uploads(integer, integer) to service_role;
revoke all on function public.finish_health_record_source_uploads(text[]) from public, anon, authenticated;
grant execute on function public.finish_health_record_source_uploads(text[]) to service_role;

notify pgrst, 'reload schema';
