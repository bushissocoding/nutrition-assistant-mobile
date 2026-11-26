-- PostgREST upsert statements can include the conflict target in the update set.
-- Row-level policies still limit profile writes to the authenticated owner's row.
grant update (id) on public.profiles to authenticated;
