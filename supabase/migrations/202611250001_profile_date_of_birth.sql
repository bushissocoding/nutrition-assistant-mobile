alter table public.profiles
  add column if not exists date_of_birth date;

grant insert (date_of_birth) on public.profiles to authenticated;
grant update (date_of_birth) on public.profiles to authenticated;
