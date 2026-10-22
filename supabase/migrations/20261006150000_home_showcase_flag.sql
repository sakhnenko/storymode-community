-- The home page's feature showcase (one light section per big feature) behind a
-- flag. Visitors to the home page are mostly signed out, and can_use_feature
-- answers false without a user, so a second function tells anyone whether a
-- flag is open to everyone. It reveals only that rollout, nothing else.
insert into public.feature_flags (key, enabled_for_all)
values ('home_showcase', false)
on conflict (key) do nothing;

create or replace function public.feature_open_to_everyone(_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select enabled_for_all and not disabled from public.feature_flags where key = _key),
    false
  );
$$;

revoke all on function public.feature_open_to_everyone(text) from public;
grant execute on function public.feature_open_to_everyone(text) to anon, authenticated;

notify pgrst, 'reload schema';
