-- Admins can preview flagged features; only admins can change rollout.
create table public.feature_flags (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  enabled_for_all boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from public, anon;
grant select, update on public.feature_flags to authenticated;

create policy "Admins read feature flags" on public.feature_flags
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins update feature flags" on public.feature_flags
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

insert into public.feature_flags (key, enabled_for_all)
values ('chapter_map_outline', false);

create function public.can_use_feature(_key text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or coalesce((select enabled_for_all from public.feature_flags where key = _key), false)
  );
$$;

revoke all on function public.can_use_feature(text) from public, anon;
grant execute on function public.can_use_feature(text) to authenticated;

notify pgrst, 'reload schema';
