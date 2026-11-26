-- Keep existing diary/grocery snapshots readable while accepting future
-- record IDs from a licensed food-composition source.
alter table public.meal_entries drop constraint if exists meal_entries_food_id_check;
alter table public.meal_entries add constraint meal_entries_food_id_check
  check (food_id ~ '^[a-z][a-z0-9-]{1,63}:[A-Za-z0-9._-]{1,128}$');
alter table public.meal_entries drop constraint if exists meal_entries_source_check;
alter table public.meal_entries add constraint meal_entries_source_check
  check (jsonb_typeof(source) = 'object' and source->>'id' ~ '^[A-Za-z][A-Za-z0-9._-]{0,63}$');

alter table public.shopping_list_items drop constraint if exists shopping_list_items_food_id_check;
alter table public.shopping_list_items add constraint shopping_list_items_food_id_check
  check (food_id ~ '^[a-z][a-z0-9-]{1,63}:[A-Za-z0-9._-]{1,128}$');
alter table public.shopping_list_items drop constraint if exists shopping_list_items_source_check;
alter table public.shopping_list_items add constraint shopping_list_items_source_check
  check (jsonb_typeof(source) = 'object' and source->>'id' ~ '^[A-Za-z][A-Za-z0-9._-]{0,63}$');

alter table public.pantry_items drop constraint if exists pantry_items_food_id_check;
alter table public.pantry_items add constraint pantry_items_food_id_check
  check (food_id ~ '^(custom:[a-f0-9]{64}|[a-z][a-z0-9-]{1,63}:[A-Za-z0-9._-]{1,128})$');
alter table public.pantry_items drop constraint if exists pantry_items_source_check;
alter table public.pantry_items add constraint pantry_items_source_check
  check (jsonb_typeof(source) = 'object' and (
    (food_id like 'custom:%' and source->>'id' = 'USER-ENTERED')
    or (food_id not like 'custom:%' and source->>'id' ~ '^[A-Za-z][A-Za-z0-9._-]{0,63}$')
  ));

create or replace function public.replace_shopping_list_from_plan(p_saved_plan_id uuid, p_request_key text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
  v_existing_id uuid;
  v_existing_plan_id uuid;
  v_plan jsonb;
  v_list_id uuid;
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_request_key is null or p_request_key !~ '^[A-Za-z0-9_.:-]{8,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_KEY';
  end if;

  perform 1 from auth.users users where users.id = v_owner for update;

  select list.id, list.source_plan_id into v_existing_id, v_existing_plan_id
  from public.shopping_lists list
  where list.user_id = v_owner and list.request_key = p_request_key;
  if found then
    if v_existing_plan_id is distinct from p_saved_plan_id then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_existing_id;
  end if;

  select saved.plan into v_plan
  from public.meal_plans saved
  where saved.id = p_saved_plan_id and saved.user_id = v_owner and saved.plan->>'status' = 'feasible';
  if not found then
    raise exception using errcode = 'P0002', message = 'SAVED_PLAN_NOT_FOUND';
  end if;
  if jsonb_typeof(v_plan->'plan') <> 'array' or jsonb_array_length(v_plan->'plan') = 0 then
    raise exception using errcode = '22023', message = 'SAVED_PLAN_INVALID';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_plan->'plan') as meal(value)
    where jsonb_typeof(meal.value->'portions') <> 'array'
      or case when jsonb_typeof(meal.value->'portions') = 'array' then jsonb_array_length(meal.value->'portions') = 0 else true end
  ) then
    raise exception using errcode = '22023', message = 'SAVED_PLAN_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_plan->'plan') as meal(value)
    cross join lateral jsonb_array_elements(case when jsonb_typeof(meal.value->'portions') = 'array' then meal.value->'portions' else '[]'::jsonb end) as portion(value)
    where coalesce(portion.value->>'foodId', '') !~ '^[a-z][a-z0-9-]{1,63}:[A-Za-z0-9._-]{1,128}$'
      or coalesce(portion.value->>'food', '') = ''
      or jsonb_typeof(portion.value->'grams') <> 'number'
      or case when jsonb_typeof(portion.value->'grams') = 'number' then (portion.value->>'grams')::numeric <= 0 or (portion.value->>'grams')::numeric > 5000 else true end
      or coalesce(portion.value->'provenance'->>'sourceId', '') !~ '^[A-Za-z][A-Za-z0-9._-]{0,63}$'
      or coalesce(portion.value->'provenance'->>'sourceRecordId', '') = ''
      or coalesce(portion.value->'provenance'->>'edition', '') = ''
      or coalesce(portion.value->'provenance'->>'catalogVersion', '') = ''
  ) then
    raise exception using errcode = '22023', message = 'SAVED_PLAN_INVALID';
  end if;
  if exists (
    select portion.value->>'foodId'
    from jsonb_array_elements(v_plan->'plan') as meal(value)
    cross join lateral jsonb_array_elements(meal.value->'portions') as portion(value)
    group by portion.value->>'foodId'
    having count(distinct portion.value->'provenance'->>'sourceId') > 1
      or count(distinct portion.value->'provenance'->>'sourceRecordId') > 1
      or count(distinct portion.value->'provenance'->>'edition') > 1
      or count(distinct portion.value->'provenance'->>'catalogVersion') > 1
  ) then
    raise exception using errcode = '22023', message = 'SAVED_PLAN_INVALID';
  end if;

  update public.shopping_lists set is_current = false
  where user_id = v_owner and is_current;
  insert into public.shopping_lists (user_id, source_plan_id, request_key, is_current)
  values (v_owner, p_saved_plan_id, p_request_key, true)
  returning id into v_list_id;

  insert into public.shopping_list_items (list_id, food_id, name, amount, unit, source, catalog_version)
  select
    v_list_id,
    portion.value->>'foodId',
    min(portion.value->>'food'),
    sum((portion.value->>'grams')::numeric),
    'g',
    jsonb_build_object(
      'id', max(portion.value->'provenance'->>'sourceId'),
      'recordId', max(portion.value->'provenance'->>'sourceRecordId'),
      'edition', max(portion.value->'provenance'->>'edition')
    ),
    max(portion.value->'provenance'->>'catalogVersion')
  from jsonb_array_elements(v_plan->'plan') as meal(value)
  cross join lateral jsonb_array_elements(meal.value->'portions') as portion(value)
  group by portion.value->>'foodId';

  return v_list_id;
end;
$$;
