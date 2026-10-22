-- A flag can now be off for everyone, admins included, to stop a feature outright
-- (before, admins always had every flagged feature). Rollouts are then:
-- off, admins only, or everyone.
alter table public.feature_flags
  add column if not exists disabled boolean not null default false;

alter table public.feature_flags
  drop constraint if exists feature_flags_off_or_on;
alter table public.feature_flags
  add constraint feature_flags_off_or_on check (not (disabled and enabled_for_all));

create or replace function public.can_use_feature(_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and not coalesce((select disabled from public.feature_flags where key = _key), false)
    and (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      or coalesce((select enabled_for_all from public.feature_flags where key = _key), false)
    );
$$;

revoke all on function public.can_use_feature(text) from public, anon;
grant execute on function public.can_use_feature(text) to authenticated;

notify pgrst, 'reload schema';
