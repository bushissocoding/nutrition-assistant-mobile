revoke all on function public.delete_health_record(uuid) from public, anon, authenticated;
drop function public.delete_health_record(uuid);

create function public.delete_health_record(p_record_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'HEALTH_RECORD_DELETE_REQUIRES_SERVER';
  end if;
  if p_record_id is null or p_user_id is null then
    raise exception using errcode = '22023', message = 'INVALID_HEALTH_RECORD';
  end if;
  delete from public.health_records where id = p_record_id and user_id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'HEALTH_RECORD_NOT_FOUND'; end if;
end;
$$;

revoke all on function public.delete_health_record(uuid, uuid) from public, anon, authenticated;
grant execute on function public.delete_health_record(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
