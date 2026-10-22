-- Admin-only reporting API for WorkOS. Run in Storymode's Lovable Cloud SQL editor.
-- Does not modify customer data, existing RLS policies, or account roles.
begin;

create or replace function public.workos_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  result jsonb;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Storymode admin access required' using errcode = '42501';
  end if;

  with
  customers as materialized (
    select u.id, u.email, u.created_at, u.email_confirmed_at, u.invited_at
    from auth.users u
    where not exists (
      select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin'
    )
  ),
  seeded_projects as materialized (
    select id from public.projects
    where is_starter is true or is_template is true or title ~* '^example:\s'
  ),
  seeded_grids as materialized (
    select g.id from public.notebook_grids g join seeded_projects p on p.id = g.project_id
  ),
  content_actions as (
    select 'Projects:' || p.id as id, p.user_id, p.created_at, 'Projects'::text as feature
    from public.projects p where not exists (select 1 from seeded_projects s where s.id = p.id)
    union all
    select 'Folios:' || g.id, g.user_id, g.created_at, 'Folios'
    from public.notebook_grids g where not exists (select 1 from seeded_projects s where s.id = g.project_id)
    union all
    select 'Notes:' || n.id, n.user_id, n.created_at, 'Notes'
    from public.notepads n where not exists (select 1 from seeded_grids s where s.id = n.grid_id)
    union all
    select 'Chapters:' || c.id, c.user_id, c.created_at, 'Chapters'
    from public.story_chapters c where not exists (select 1 from seeded_projects s where s.id = c.project_id)
    union all
    select 'Maps:' || m.id, m.user_id, m.created_at, 'Maps'
    from public.map_canvas m where not exists (select 1 from seeded_projects s where s.id = m.project_id)
  ),
  actions as (
    select id, user_id, created_at, 'content'::text as kind, feature, null::bigint as credits from content_actions
    union all
    select 'ledger:' || l.id, l.user_id, l.created_at, 'ai',
      replace(coalesce(l.reason, 'Other AI'), '_', ' '), abs(l.delta::bigint)
    from public.credit_ledger l where l.kind = 'spend'
  )
  select jsonb_build_object(
    'mode', 'live',
    'fetchedAt', now(),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', coalesce(nullif(p.display_name, ''), nullif(split_part(u.email, '@', 1), ''), 'Storymode writer'),
        'email', u.email,
        'createdAt', u.created_at,
        'confirmedAt', u.email_confirmed_at,
        'invitedAt', u.invited_at,
        'plan', coalesce(pl.plan, 'draft'),
        'onboardingAt', o.completed_at
      ) order by u.created_at, u.id)
      from customers u
      left join public.profiles p on p.user_id = u.id
      left join public.user_plans pl on pl.user_id = u.id
      left join public.user_onboarding o on o.user_id = u.id
    ), '[]'::jsonb),
    'activity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'userId', a.user_id, 'at', a.created_at,
        'kind', a.kind, 'feature', a.feature, 'credits', coalesce(a.credits, 0)
      ) order by a.created_at, a.id)
      from actions a join customers u on u.id = a.user_id
      where a.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC') - interval '182 days'
    ), '[]'::jsonb),
    'waitlist', coalesce((
      select jsonb_agg(jsonb_build_object('createdAt', w.created_at, 'status', w.status) order by w.created_at, w.id)
      from public.waitlist w
    ), '[]'::jsonb),
    'limitations', jsonb_build_array(
      'Admin accounts and starter example content are excluded. Other test accounts need an explicit exclusion list.',
      'Content trends include surviving records only. Deleted content and accounts are absent from historical counts.',
      'Billed AI actions are credit-ledger entries, not all AI requests. BYOK use may not be recorded.',
      'Waitlist records can be removed after signup; historical waitlist conversion cannot be reconstructed.'
    )
  ) into result;

  return result;
end;
$function$;

-- PostgREST authenticates the caller; the function checks the admin role again.
revoke all on function public.workos_snapshot() from public, anon;
grant execute on function public.workos_snapshot() to authenticated;
comment on function public.workos_snapshot() is 'Read-only metadata snapshot for WorkOS. Existing Storymode admins only; excludes writing content and prompts.';
notify pgrst, 'reload schema';
commit;

-- Rollback: drop function public.workos_snapshot();
