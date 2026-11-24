create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  request_key text not null check (request_key ~ '^[A-Za-z0-9_.:-]{8,128}$'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and plan->>'status' = 'feasible'),
  profile_updated_at timestamptz,
  catalog_version text not null check (length(catalog_version) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint meal_plans_user_request_key_unique unique (user_id, request_key)
);

create index if not exists meal_plans_latest_by_user on public.meal_plans (user_id, created_at desc, id desc);

alter table public.meal_plans enable row level security;
revoke all on public.meal_plans from anon, authenticated;
grant select, insert, delete on public.meal_plans to authenticated;

create policy meal_plans_select_own on public.meal_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy meal_plans_insert_own on public.meal_plans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy meal_plans_delete_own on public.meal_plans
  for delete to authenticated using (user_id = (select auth.uid()));
