-- Project memory format v2: each analyzed chapter also records the entities it
-- mentions (people, places, organizations, ...) under the names it uses, and
-- each claim carries typed links and a time anchor inside the claims JSON.
-- The extractor passes the format version it produces. Analyses made by an
-- older extractor stay readable, and are re-run only when a newer extractor
-- asks for them. Both new parameters default to the previous behavior, so the
-- previously deployed function keeps working until it is redeployed.

alter table public.project_memory_chapters
  add column if not exists entities jsonb not null default '[]'::jsonb;
alter table public.project_memory_chapters
  drop constraint if exists project_memory_chapters_entities_check;
alter table public.project_memory_chapters
  add constraint project_memory_chapters_entities_check
  check (jsonb_typeof(entities) = 'array' and jsonb_array_length(entities) <= 100);

drop function if exists public.begin_project_memory(uuid, uuid, uuid);
create function public.begin_project_memory(_user_id uuid, _project_id uuid, _chapter_id uuid,
  _version integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s jsonb; j public.project_memory_jobs; token uuid;
begin
  if not exists (select 1 from public.projects where id = _project_id and user_id = _user_id)
    or not (public.has_role(_user_id, 'admin'::public.app_role) or coalesce(
      (select enabled_for_all from public.feature_flags where key = 'project_memory'), false))
    or not exists (select 1 from public.project_writing_profiles where project_id = _project_id and enabled)
  then raise exception 'Forbidden' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(_chapter_id::text));
  s := public.project_memory_source(_project_id, _chapter_id);
  if s is null then raise exception 'Chapter not found'; end if;
  if exists (select 1 from public.project_memory_chapters where chapter_id = _chapter_id
    and revision = s->>'revision' and version >= _version)
  then return jsonb_build_object('cached', true); end if;
  select * into j from public.project_memory_jobs where chapter_id = _chapter_id;
  if j.status = 'running' and j.started_at > now() - interval '5 minutes' then
    return jsonb_build_object('busy', true);
  end if;
  token := gen_random_uuid();
  insert into public.project_memory_jobs(chapter_id, project_id, token, status)
  values (_chapter_id, _project_id, token, 'running')
  on conflict (chapter_id) do update set token = excluded.token, status = 'running', started_at = now();
  return jsonb_build_object('token', token, 'source', s);
end; $$;

drop function if exists public.finish_project_memory(uuid, uuid, uuid, uuid, text, jsonb, text);
create function public.finish_project_memory(_user_id uuid, _project_id uuid, _chapter_id uuid,
  _token uuid, _revision text, _claims jsonb, _writing_kind text,
  _entities jsonb default '[]'::jsonb, _version integer default 1)
returns void language plpgsql security definer set search_path = '' as $$
declare s jsonb;
begin
  -- Lock the source rows before rechecking freshness, preventing a save from
  -- racing publication. Reads also compare revisions, so later edits go stale.
  perform 1 from public.story_chapters where id = _chapter_id and project_id = _project_id for share;
  perform 1 from public.story_chapter_drafts where id = (
    select active_draft_id from public.story_chapters where id = _chapter_id) for share;
  perform 1 from public.project_memory_jobs where chapter_id = _chapter_id
    and token = _token and status = 'running' for update;
  if not found then raise exception 'Analysis lease expired'; end if;
  if not exists (select 1 from public.projects where id = _project_id and user_id = _user_id)
    or not exists (select 1 from public.project_writing_profiles where project_id = _project_id and enabled)
    or not (public.has_role(_user_id, 'admin'::public.app_role) or coalesce(
      (select enabled_for_all from public.feature_flags where key = 'project_memory'), false))
  then raise exception 'Forbidden' using errcode = '42501'; end if;
  s := public.project_memory_source(_project_id, _chapter_id);
  if s is null or s->>'revision' <> _revision then raise exception 'Source changed; analyze again'; end if;
  insert into public.project_memory_chapters(chapter_id, project_id, revision, draft_id, writing_kind,
    claims, entities, version)
  values (_chapter_id, _project_id, _revision, (s->>'draftId')::uuid, _writing_kind,
    _claims, coalesce(_entities, '[]'::jsonb), _version)
  on conflict (chapter_id) do update set revision = excluded.revision,
    draft_id = excluded.draft_id, writing_kind = excluded.writing_kind, claims = excluded.claims,
    entities = excluded.entities, analyzed_at = now(), version = excluded.version;
  update public.project_memory_jobs set status = 'complete' where chapter_id = _chapter_id and token = _token;
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
    where c.project_id = _project_id), '[]'::jsonb)
  );
end; $$;

revoke all on function public.begin_project_memory(uuid, uuid, uuid, integer),
  public.finish_project_memory(uuid, uuid, uuid, uuid, text, jsonb, text, jsonb, integer),
  public.read_project_memory(uuid) from public, anon, authenticated;
grant execute on function public.begin_project_memory(uuid, uuid, uuid, integer),
  public.finish_project_memory(uuid, uuid, uuid, uuid, text, jsonb, text, jsonb, integer) to service_role;
grant execute on function public.read_project_memory(uuid) to authenticated;
notify pgrst, 'reload schema';