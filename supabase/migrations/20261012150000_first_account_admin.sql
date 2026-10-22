-- A fresh install (self-hosted) has no way to make anyone admin without
-- editing the database, so the very first account becomes admin. It only fires
-- when the new account is the only one and there are no admins yet, so it can
-- never fire on a project that already has users.
create or replace function public.grant_first_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Two first sign-ups at the same moment must not both become admin.
  perform pg_advisory_xact_lock(hashtext('storymode.first_admin'));
  if not exists (select 1 from auth.users where id <> new.id)
     and not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.grant_first_admin() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_first_admin on auth.users;
create trigger on_auth_user_created_first_admin
  after insert on auth.users
  for each row execute function public.grant_first_admin();
