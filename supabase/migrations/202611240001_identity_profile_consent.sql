create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  mode text not null check (mode in ('healthy', 'patient')),
  gender text not null check (gender in ('female', 'male', 'unspecified')),
  age smallint not null check (age between 1 and 120),
  height_cm numeric(5, 2) not null check (height_cm between 50 and 260),
  weight_kg numeric(6, 2) not null check (weight_kg between 2 and 500),
  activity_level text not null check (activity_level in ('low', 'moderate', 'high')),
  condition_type text not null check (condition_type in (
    'unspecified', 'heart-failure-stage-1-2', 'heart-failure-stage-3', 'heart-failure-stage-4',
    'acute-kidney-disease', 'chronic-kidney-disease-stage-1-2', 'chronic-kidney-disease-stage-3-4',
    'diabetes', 'hypertension', 'other'
  )),
  allergies text[] not null default '{}',
  symptom_notes text not null default '',
  red_flags text[] not null default '{}',
  diagnosis_notes text not null default '',
  hard_limits jsonb not null default '{}'::jsonb check (jsonb_typeof(hard_limits) = 'object'),
  medical_limits_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_limits_confirmed check (mode <> 'patient' or medical_limits_confirmed)
);

create unique index if not exists profiles_username_ci_unique on public.profiles (lower(username));

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (length(version) between 1 and 100),
  choices jsonb not null check (
    jsonb_typeof(choices) = 'object'
    and choices ?& array['profile_processing', 'nutrition_processing', 'data_lifecycle', 'ai_processing', 'health_record_storage']
    and (choices->>'profile_processing') in ('true', 'false')
    and (choices->>'nutrition_processing') in ('true', 'false')
    and (choices->>'data_lifecycle') in ('true', 'false')
    and (choices->>'ai_processing') in ('true', 'false')
    and (choices->>'health_record_storage') in ('true', 'false')
  ),
  accepted_at timestamptz not null default now()
);

create index if not exists consent_records_latest_by_user on public.consent_records (user_id, accepted_at desc, id desc);

alter table public.profiles enable row level security;
alter table public.consent_records enable row level security;

revoke all on public.profiles, public.consent_records from anon, authenticated;
grant select on public.profiles to authenticated;
grant insert (id, username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type, allergies, symptom_notes, red_flags, diagnosis_notes, hard_limits, medical_limits_confirmed)
  on public.profiles to authenticated;
grant update (username, mode, gender, age, height_cm, weight_kg, activity_level, condition_type, allergies, symptom_notes, red_flags, diagnosis_notes, hard_limits, medical_limits_confirmed)
  on public.profiles to authenticated;
grant delete on public.profiles to authenticated;
grant select on public.consent_records to authenticated;
grant insert (user_id, version, choices) on public.consent_records to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy profiles_delete_own on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

create policy consent_records_select_own on public.consent_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy consent_records_insert_own on public.consent_records
  for insert to authenticated with check (user_id = (select auth.uid()));
