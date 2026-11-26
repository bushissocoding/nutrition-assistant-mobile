create or replace function public.save_nutrition_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_preferences public.nutrition_preferences%rowtype;
  v_food_preferences text[];
  v_key_count integer;
begin
  if v_user is null then raise exception using errcode = '28000', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_preferences is null or jsonb_typeof(p_preferences) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'INVALID_NUTRITION_PREFERENCES';
  end if;
  select count(*) into v_key_count from jsonb_object_keys(p_preferences);
  if v_key_count <> 4
    or not (p_preferences ?& array['dietaryVariety','foodPreferences','allergyReminder','trackConfirmedTargets']) then
    raise exception using errcode = '22023', message = 'INVALID_NUTRITION_PREFERENCES';
  end if;
  if p_preferences->>'dietaryVariety' is null or p_preferences->>'dietaryVariety' not in ('simple', 'balanced', 'varied')
    or jsonb_typeof(p_preferences->'foodPreferences') is distinct from 'array'
    or jsonb_typeof(p_preferences->'allergyReminder') is distinct from 'boolean'
    or jsonb_typeof(p_preferences->'trackConfirmedTargets') is distinct from 'boolean' then
    raise exception using errcode = '22023', message = 'INVALID_NUTRITION_PREFERENCES';
  end if;
  if jsonb_array_length(p_preferences->'foodPreferences') > 6
    or exists (select 1 from jsonb_array_elements(p_preferences->'foodPreferences') as choice(value)
      where jsonb_typeof(choice.value) is distinct from 'string'
        or choice.value #>> '{}' not in ('vegetarian', 'low_sugar', 'low_salt', 'mild', 'Vietnamese', 'easy_cook')) then
    raise exception using errcode = '22023', message = 'INVALID_NUTRITION_PREFERENCES';
  end if;
  select coalesce(array_agg(choice.value), '{}'::text[]) into v_food_preferences
    from (select distinct choice.value #>> '{}' as value from jsonb_array_elements(p_preferences->'foodPreferences') as choice(value)) choice;
  if cardinality(v_food_preferences) <> jsonb_array_length(p_preferences->'foodPreferences') then
    raise exception using errcode = '22023', message = 'DUPLICATE_NUTRITION_PREFERENCE';
  end if;
  insert into public.nutrition_preferences (user_id, dietary_variety, food_preferences, allergy_reminder, track_confirmed_targets)
  values (v_user, p_preferences->>'dietaryVariety', v_food_preferences, (p_preferences->>'allergyReminder')::boolean, (p_preferences->>'trackConfirmedTargets')::boolean)
  on conflict (user_id) do update set dietary_variety = excluded.dietary_variety, food_preferences = excluded.food_preferences,
    allergy_reminder = excluded.allergy_reminder, track_confirmed_targets = excluded.track_confirmed_targets, updated_at = now()
  returning * into v_preferences;
  return jsonb_build_object('dietaryVariety', v_preferences.dietary_variety, 'foodPreferences', to_jsonb(v_preferences.food_preferences),
    'allergyReminder', v_preferences.allergy_reminder, 'trackConfirmedTargets', v_preferences.track_confirmed_targets,
    'updatedAt', v_preferences.updated_at);
end;
$$;

revoke all on function public.save_nutrition_preferences(jsonb) from public, anon;
grant execute on function public.save_nutrition_preferences(jsonb) to authenticated;
