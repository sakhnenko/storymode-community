-- The author's calls on identity in project memory: two Codex entries of one
-- kind are the same entity ("Young Asari woman" is Olive), or they are not
-- (undoing a join the analyzer made from a reveal). Names are stored as the
-- comparison keys the Codex uses, in sorted order, so a pair has one row
-- whichever entry the author started from. `keep` is the name to show a
-- joined entry under.

create table if not exists public.project_memory_identities (
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('person', 'place', 'organization', 'object', 'system', 'concept', 'event')),
  name_a text not null check (length(name_a) between 1 and 200),
  name_b text not null check (length(name_b) between 1 and 200),
  same boolean not null,
  keep text check (keep is null or keep = name_a or keep = name_b),
  created_at timestamptz not null default now(),
  primary key (project_id, kind, name_a, name_b),
  check (name_a < name_b)
);
alter table public.project_memory_identities enable row level security;
revoke all on public.project_memory_identities from public, anon, authenticated;
grant all on public.project_memory_identities to service_role;

-- _same null forgets the call, leaving the analyzer's view.
create or replace function public.set_project_memory_identity(_project_id uuid, _kind text,
  _a text, _b text, _same boolean, _keep text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare lo text := least(_a, _b); hi text := greatest(_a, _b);
begin
  if not public.can_use_feature('project_memory') or not exists (
    select 1 from public.projects where id = _project_id and user_id = auth.uid()
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if lo is null or lo = hi then raise exception 'Invalid identity'; end if;
  if _same is null then
    delete from public.project_memory_identities
    where project_id = _project_id and kind = _kind and name_a = lo and name_b = hi;
  else
    if (select count(*) from public.project_memory_identities where project_id = _project_id) >= 500 then
      raise exception 'Too many identity decisions';
    end if;
    insert into public.project_memory_identities(project_id, kind, name_a, name_b, same, keep)
    values (_project_id, _kind, lo, hi, _same, case when _same then _keep end)
    on conflict (project_id, kind, name_a, name_b) do update
      set same = excluded.same, keep = excluded.keep, created_at = now();
  end if;
end; $$;

create or replace function public.read_project_memory(_project_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_use_feature('project_memory') or not exists (
    select 1 from public.projects where id = _project_id and user_id = auth.uid()
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from public.project_writing_profiles p where p.project_id = _project_id),
    'chapters', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'position', c.position,
      'currentRevision', public.project_memory_source(_project_id, c.id)->>'revision',
      'revision', m.revision, 'draftId', m.draft_id, 'claims', coalesce(m.claims, '[]'::jsonb),
      'entities', coalesce(m.entities, '[]'::jsonb), 'version', m.version,
      'writingKind', m.writing_kind, 'analyzedAt', m.analyzed_at,
      'status', case when j.status = 'running' and j.started_at < now() - interval '5 minutes'
        then 'failed' else j.status end,
      'overrides', coalesce((select jsonb_object_agg(o.claim_key, jsonb_build_object(
        'disposition', o.disposition, 'correction', o.correction))
        from public.project_memory_overrides o where o.chapter_id = c.id), '{}'::jsonb)
    ) order by c.position) from public.story_chapters c
    left join public.project_memory_chapters m on m.chapter_id = c.id
    left join public.project_memory_jobs j on j.chapter_id = c.id
    where c.project_id = _project_id), '[]'::jsonb),
    'identities', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', i.kind, 'a', i.name_a, 'b', i.name_b, 'same', i.same, 'keep', i.keep) order by i.created_at)
      from public.project_memory_identities i where i.project_id = _project_id), '[]'::jsonb)
  );
end; $$;

revoke all on function public.set_project_memory_identity(uuid, text, text, text, boolean, text),
  public.read_project_memory(uuid) from public, anon, authenticated;
grant execute on function public.set_project_memory_identity(uuid, text, text, text, boolean, text),
  public.read_project_memory(uuid) to authenticated;
notify pgrst, 'reload schema';