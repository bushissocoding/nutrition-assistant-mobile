create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  food_id text not null check (food_id ~ '^fdc:[0-9]{1,12}$'),
  food_name text not null check (length(food_name) between 1 and 500),
  portion_grams numeric(10, 3) not null check (portion_grams > 0 and portion_grams <= 5000),
  meal_type text not null check (meal_type in ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK')),
  consumed_at timestamptz not null,
  time_zone text not null check (length(time_zone) between 1 and 100),
  notes text check (notes is null or length(notes) <= 500),
  nutrients jsonb not null check (jsonb_typeof(nutrients) = 'object'),
  source jsonb not null check (jsonb_typeof(source) = 'object' and source->>'id' = 'USDA-FDC'),
  food_snapshot jsonb not null check (jsonb_typeof(food_snapshot) = 'object'),
  catalog_version text not null check (length(catalog_version) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint meal_entries_owner_request_key_unique unique (user_id, request_key)
);

create index if not exists meal_entries_owner_consumed_at on public.meal_entries (user_id, consumed_at, id) where deleted_at is null;
create index if not exists meal_entries_owner_id on public.meal_entries (user_id, id) where deleted_at is null;

create or replace function public.set_account_meal_entry_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger meal_entries_set_updated_at
before update on public.meal_entries
for each row execute function public.set_account_meal_entry_updated_at();

alter table public.meal_entries enable row level security;
revoke all on public.meal_entries from anon, authenticated;
grant select on public.meal_entries to authenticated;
grant insert (user_id, request_key, intent_hash, food_id, food_name, portion_grams, meal_type, consumed_at, time_zone, notes, nutrients, source, food_snapshot, catalog_version)
  on public.meal_entries to authenticated;
grant update (food_id, food_name, portion_grams, meal_type, consumed_at, time_zone, notes, nutrients, source, food_snapshot, catalog_version, deleted_at)
  on public.meal_entries to authenticated;

create policy meal_entries_select_own on public.meal_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy meal_entries_insert_own on public.meal_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy meal_entries_update_own on public.meal_entries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
