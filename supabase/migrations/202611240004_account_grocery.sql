create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_plan_id uuid references public.meal_plans (id) on delete set null,
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_lists_owner_request_key_unique unique (user_id, request_key)
);

create unique index if not exists shopping_lists_one_current_per_owner on public.shopping_lists (user_id) where is_current;
create index if not exists shopping_lists_owner_created_at on public.shopping_lists (user_id, created_at desc, id desc);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists (id) on delete cascade,
  food_id text not null check (food_id ~ '^fdc:[0-9]{1,12}$'),
  name text not null check (length(name) between 1 and 500),
  amount numeric(13, 3) not null check (amount > 0 and amount <= 1000000),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack')),
  purchased boolean not null default false,
  source jsonb not null check (jsonb_typeof(source) = 'object' and source->>'id' = 'USDA-FDC'),
  catalog_version text not null check (length(catalog_version) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shopping_list_items_food_unique unique (list_id, food_id)
);

create index if not exists shopping_list_items_by_list on public.shopping_list_items (list_id, created_at, id);

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  food_id text not null check (food_id ~ '^(fdc:[0-9]{1,12}|custom:[a-f0-9]{64})$'),
  name text not null check (length(name) between 1 and 500),
  amount numeric(13, 3) not null check (amount > 0 and amount <= 1000000),
  unit text not null check (unit in ('g', 'kg', 'ml', 'l', 'piece', 'bunch', 'pack')),
  source jsonb not null check (jsonb_typeof(source) = 'object' and (
    (food_id like 'fdc:%' and source->>'id' = 'USDA-FDC')
    or (food_id like 'custom:%' and source->>'id' = 'USER-ENTERED')
  )),
  catalog_version text not null check (length(catalog_version) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pantry_items_owner_food_unique unique (user_id, food_id)
);

create index if not exists pantry_items_by_owner on public.pantry_items (user_id, created_at, id);

create or replace function public.set_account_grocery_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shopping_lists_set_updated_at
before update on public.shopping_lists
for each row execute function public.set_account_grocery_updated_at();
create trigger shopping_list_items_set_updated_at
before update on public.shopping_list_items
for each row execute function public.set_account_grocery_updated_at();
create trigger pantry_items_set_updated_at
before update on public.pantry_items
for each row execute function public.set_account_grocery_updated_at();
revoke all on function public.set_account_grocery_updated_at() from public, anon, authenticated;

alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.pantry_items enable row level security;
revoke all on public.shopping_lists, public.shopping_list_items, public.pantry_items from anon, authenticated;
grant select on public.shopping_lists to authenticated;
grant select, insert (list_id, food_id, name, amount, unit, purchased, source, catalog_version), update (amount, unit, purchased), delete on public.shopping_list_items to authenticated;
grant select, insert (user_id, food_id, name, amount, unit, source, catalog_version), update (amount, unit), delete on public.pantry_items to authenticated;

create policy shopping_lists_select_own on public.shopping_lists
  for select to authenticated using (user_id = (select auth.uid()));
create policy shopping_list_items_select_own on public.shopping_list_items
  for select to authenticated using (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_items.list_id and list.user_id = (select auth.uid())
  ));
create policy shopping_list_items_insert_own on public.shopping_list_items
  for insert to authenticated with check (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_items.list_id and list.user_id = (select auth.uid())
  ));
create policy shopping_list_items_update_own on public.shopping_list_items
  for update to authenticated using (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_items.list_id and list.user_id = (select auth.uid())
  )) with check (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_items.list_id and list.user_id = (select auth.uid())
  ));
create policy shopping_list_items_delete_own on public.shopping_list_items
  for delete to authenticated using (exists (
    select 1 from public.shopping_lists list
    where list.id = shopping_list_items.list_id and list.user_id = (select auth.uid())
  ));
create policy pantry_items_select_own on public.pantry_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy pantry_items_insert_own on public.pantry_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy pantry_items_update_own on public.pantry_items
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pantry_items_delete_own on public.pantry_items
  for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.enforce_account_shopping_list_item_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_count integer;
begin
  perform 1 from public.shopping_lists list
  where list.id = new.list_id and list.user_id = auth.uid()
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'SHOPPING_LIST_NOT_OWNED';
  end if;
  select count(*) into v_item_count from public.shopping_list_items item where item.list_id = new.list_id;
  if v_item_count >= 100 then
    raise exception using errcode = '54000', message = 'SHOPPING_LIST_FULL';
  end if;
  return new;
end;
$$;

create trigger shopping_list_items_enforce_cap
before insert on public.shopping_list_items
for each row execute function public.enforce_account_shopping_list_item_cap();
revoke all on function public.enforce_account_shopping_list_item_cap() from public, anon, authenticated;

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
    where coalesce(portion.value->>'foodId', '') !~ '^fdc:[0-9]{1,12}$'
      or coalesce(portion.value->>'food', '') = ''
      or jsonb_typeof(portion.value->'grams') <> 'number'
      or case when jsonb_typeof(portion.value->'grams') = 'number' then (portion.value->>'grams')::numeric <= 0 or (portion.value->>'grams')::numeric > 5000 else true end
      or coalesce(portion.value->'provenance'->>'sourceId', '') <> 'USDA-FDC'
      or coalesce(portion.value->'provenance'->>'sourceRecordId', '') = ''
      or coalesce(portion.value->'provenance'->>'edition', '') = ''
      or coalesce(portion.value->'provenance'->>'catalogVersion', '') = ''
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
      'id', 'USDA-FDC',
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

create or replace function public.clear_current_shopping_list()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED';
  end if;
  update public.shopping_lists set is_current = false
  where user_id = v_owner and is_current;
  return found;
end;
$$;

revoke all on function public.replace_shopping_list_from_plan(uuid, text) from public, anon;
grant execute on function public.replace_shopping_list_from_plan(uuid, text) to authenticated;
revoke all on function public.clear_current_shopping_list() from public, anon;
grant execute on function public.clear_current_shopping_list() to authenticated;
