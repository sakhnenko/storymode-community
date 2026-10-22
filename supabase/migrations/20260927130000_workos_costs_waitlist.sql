-- Additive reporting only. Existing waitlist/signup writers remain unchanged.
begin;
create table if not exists public.workos_reporting_coverage (
  name text primary key,
  started_at timestamptz not null default now()
);
insert into public.workos_reporting_coverage(name) values ('waitlist') on conflict do nothing;

-- Deliberately no FK: these anonymous event IDs survive waitlist conversion/deletion.
-- No email, name, writing content, or IP is retained here.
create table if not exists public.workos_waitlist_joins (
  waitlist_id uuid primary key,
  joined_at timestamptz not null,
  source text,
  invited_at timestamptz,
  converted_at timestamptz,
  removed_at timestamptz,
  backfilled boolean not null default false
);
alter table public.workos_reporting_coverage enable row level security;
alter table public.workos_waitlist_joins enable row level security;
revoke all on public.workos_reporting_coverage, public.workos_waitlist_joins from public, anon, authenticated;

create or replace function public.workos_track_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $body$
begin
  if tg_op = 'DELETE' then
    update public.workos_waitlist_joins
    set removed_at = now(), converted_at = coalesce(converted_at, (
      select u.created_at from auth.users u
      where lower(u.email) = lower(old.email) and u.created_at >= old.created_at order by u.created_at limit 1
    ))
    where waitlist_id = old.id;
    return old;
  end if;
  insert into public.workos_waitlist_joins(waitlist_id, joined_at, source, invited_at)
  values(new.id, new.created_at, left(new.source, 100), new.invited_at)
  on conflict(waitlist_id) do update set
    invited_at = coalesce(public.workos_waitlist_joins.invited_at, excluded.invited_at);
  return new;
end;
$body$;
revoke all on function public.workos_track_waitlist() from public, anon, authenticated;
-- Recreate our own trigger only, making repeated installation safe.
drop trigger if exists workos_waitlist_history on public.waitlist;
create trigger workos_waitlist_history after insert or update or delete on public.waitlist
for each row execute function public.workos_track_waitlist();

insert into public.workos_waitlist_joins(waitlist_id, joined_at, source, invited_at, backfilled)
select id, created_at, left(source, 100), invited_at, true from public.waitlist
on conflict(waitlist_id) do nothing;

create or replace function public.workos_business_snapshot()
returns jsonb language plpgsql stable security definer set search_path = '' as $body$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Storymode admin access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'users', coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id, 'name', coalesce(nullif(p.display_name, ''), nullif(split_part(u.email, '@', 1), ''), 'Storymode writer'),
      'email', u.email, 'plan', coalesce(pl.plan, 'draft'),
      'isAdmin', exists(select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')
    ) order by u.created_at, u.id) from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.user_plans pl on pl.user_id = u.id), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object(
      'id', l.id, 'userId', l.user_id, 'at', l.created_at, 'feature', coalesce(l.reason, 'Other AI'),
      'credits', abs(l.delta::bigint), 'model', l.metadata->>'model',
      'inputTokens', case when jsonb_typeof(l.metadata->'input_tokens') = 'number' then l.metadata->'input_tokens' else null end,
      'outputTokens', case when jsonb_typeof(l.metadata->'output_tokens') = 'number' then l.metadata->'output_tokens' else null end,
      'images', case when jsonb_typeof(l.metadata->'images') = 'number' then l.metadata->'images' else null end
    ) order by l.created_at, l.id) from public.credit_ledger l
    where l.kind = 'spend' and l.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '182 days'), '[]'::jsonb),
    'waitlist', jsonb_build_object(
      'trackingSince', (select started_at from public.workos_reporting_coverage where name = 'waitlist'),
      'joins', coalesce((select jsonb_agg(jsonb_build_object(
        'id', waitlist_id, 'at', joined_at, 'source', coalesce(source, 'Unknown'),
        'invitedAt', invited_at, 'convertedAt', converted_at, 'backfilled', backfilled
      ) order by joined_at, waitlist_id) from public.workos_waitlist_joins), '[]'::jsonb)
    )
  ) into result;
  return result;
end;
$body$;
revoke all on function public.workos_business_snapshot() from public, anon;
grant execute on function public.workos_business_snapshot() to authenticated;
comment on function public.workos_business_snapshot() is 'Admin-only cost metering and durable waitlist join history for WorkOS. Cost includes admin accounts; usage metadata only.';
notify pgrst, 'reload schema';
commit;

-- Non-destructive rollback: drop trigger workos_waitlist_history on public.waitlist;
-- revoke execute on function public.workos_business_snapshot() from authenticated;
-- Keep both history tables to preserve recorded events. Redeploy the previous WorkOS version.
