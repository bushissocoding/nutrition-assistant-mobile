create or replace function public.owns_health_record_source_path(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or p_object_name is null then return false; end if;
  return coalesce(array_length(storage.foldername(p_object_name), 1), 0) = 1
    and (storage.foldername(p_object_name))[1] = v_user::text
    and exists (
      select 1 from public.health_records record
      where record.id::text = storage.filename(p_object_name) and record.user_id = v_user
    );
end;
$$;

create or replace function public.can_upload_health_record_source(p_object_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.owns_health_record_source_path(p_object_name) then return false; end if;
  perform public.assert_health_record_consent(v_user);
  return true;
exception when insufficient_privilege then
  return false;
end;
$$;

revoke all on function public.owns_health_record_source_path(text) from public, anon, authenticated;
grant execute on function public.owns_health_record_source_path(text) to authenticated;
revoke all on function public.can_upload_health_record_source(text) from public, anon, authenticated;
grant execute on function public.can_upload_health_record_source(text) to authenticated;

drop policy if exists health_record_objects_select_own on storage.objects;
create policy health_record_objects_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'health-record-images' and public.owns_health_record_source_path(name)
  );

drop policy if exists health_record_objects_insert_own on storage.objects;
create policy health_record_objects_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'health-record-images' and public.can_upload_health_record_source(name)
  );

drop policy if exists health_record_objects_update_own on storage.objects;
create policy health_record_objects_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'health-record-images' and public.owns_health_record_source_path(name)
  ) with check (
    bucket_id = 'health-record-images' and public.can_upload_health_record_source(name)
  );

drop policy if exists health_record_objects_delete_own on storage.objects;
create policy health_record_objects_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'health-record-images' and public.owns_health_record_source_path(name)
  );
