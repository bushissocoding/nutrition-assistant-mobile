alter table public.health_records drop constraint health_record_file_metadata;
alter table public.health_records add constraint health_record_file_metadata check (
  (file_path is null and file_mime_type is null and file_size is null)
  or (
    file_path is not null and file_mime_type is not null and file_size is not null
    and (
      file_path = user_id::text || '/' || id::text
      or (
        array_length(string_to_array(file_path, '/'), 1) = 3
        and split_part(file_path, '/', 1) = user_id::text
        and split_part(file_path, '/', 2) = id::text
        and split_part(file_path, '/', 3) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    )
  )
);

create or replace function public.owns_health_record_source_path(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_folders text[] := storage.foldername(p_object_name);
  v_filename text := storage.filename(p_object_name);
begin
  if v_user is null or p_object_name is null then return false; end if;
  return exists (
    select 1 from public.health_records record
    where record.user_id = v_user
      and (
        (
          coalesce(array_length(v_folders, 1), 0) = 1
          and v_folders[1] = v_user::text
          and v_filename = record.id::text
        )
        or (
          coalesce(array_length(v_folders, 1), 0) = 2
          and v_folders[1] = v_user::text
          and v_folders[2] = record.id::text
          and v_filename ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
  );
end;
$$;

-- The current client uses immutable versioned uploads. Updating an existing
-- object would bypass the metadata compare-and-swap for legacy paths.
drop policy if exists health_record_objects_update_own on storage.objects;

-- Only the compare-and-swap RPC may attach a source after versioned uploads.
revoke all on function public.attach_health_record_source(uuid, text, text, bigint) from public, anon, authenticated;

create or replace function public.replace_health_record_source(
  p_record_id uuid,
  p_expected_file_path text,
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
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  perform public.assert_health_record_consent(v_user);
  if p_record_id is null or p_file_path is null
    or array_length(string_to_array(p_file_path, '/'), 1) <> 3
    or split_part(p_file_path, '/', 1) <> v_user::text
    or split_part(p_file_path, '/', 2) <> p_record_id::text
    or split_part(p_file_path, '/', 3) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or p_mime_type is null or p_mime_type not in ('image/jpeg', 'image/png')
    or p_file_size is null or p_file_size not between 1 and 8388608 then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD_SOURCE';
  end if;

  select file_path into v_previous_file_path
    from public.health_records
    where id = p_record_id and user_id = v_user
    for update;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
  if v_previous_file_path is distinct from p_expected_file_path then
    raise exception using errcode = '40001', message = 'HEALTH_RECORD_SOURCE_CHANGED';
  end if;

  update public.health_records set
    file_path = p_file_path,
    file_mime_type = p_mime_type,
    file_size = p_file_size,
    updated_at = now()
  where id = p_record_id and user_id = v_user;

  return v_previous_file_path;
end;
$$;

revoke all on function public.replace_health_record_source(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.replace_health_record_source(uuid, text, text, text, bigint) to authenticated;
