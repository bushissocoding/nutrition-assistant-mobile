alter table public.profiles
  drop constraint if exists profiles_username_check;

alter table public.profiles
  add constraint profiles_username_check
  check (
    char_length(username) between 3 and 30
    and username ~ '^[[:alpha:]0-9_.-]+( [[:alpha:]0-9_.-]+)*$'
  );
