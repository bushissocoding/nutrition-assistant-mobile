alter table public.health_records
  add column file_source_version integer not null default 0 check (file_source_version >= 0);

revoke all on function public.replace_health_record_source(uuid, text, text, text, bigint) from public, anon, authenticated;
drop function public.replace_health_record_source(uuid, text, text, text, bigint);

create function public.replace_health_record_source(
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
    from public.health_records
    where id = p_record_id and user_id = v_user
    for update;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
  if v_previous_file_path is distinct from p_expected_file_path
    or v_source_version is distinct from p_expected_source_version then
    raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_CHANGED';
  end if;

  update public.health_records set
    file_path = p_file_path,
    file_mime_type = p_mime_type,
    file_size = p_file_size,
    file_source_version = file_source_version + 1,
    updated_at = now()
  where id = p_record_id and user_id = v_user;

  return v_previous_file_path;
end;
$$;

create function public.cancel_health_record_source_upload(
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
    from public.health_records
    where id = p_record_id and user_id = v_user
    for update;
  if not found then return true; end if;
  if v_current_file_path = p_staged_file_path then return false; end if;
  if v_source_version > p_expected_source_version then return true; end if;
  if v_source_version is distinct from p_expected_source_version
    or v_current_file_path is distinct from p_expected_file_path then
    return false;
  end if;

  update public.health_records set file_source_version = file_source_version + 1, updated_at = now()
    where id = p_record_id and user_id = v_user;
  return true;
end;
$$;

revoke all on function public.replace_health_record_source(uuid, text, integer, text, text, bigint) from public, anon;
grant execute on function public.replace_health_record_source(uuid, text, integer, text, text, bigint) to authenticated;
revoke all on function public.cancel_health_record_source_upload(uuid, text, integer, text) from public, anon;
grant execute on function public.cancel_health_record_source_upload(uuid, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
