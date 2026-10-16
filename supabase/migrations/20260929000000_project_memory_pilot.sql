-- Additive, owner-private pilot. Roll back exposure by disabling project_memory;
-- no manuscript/folio data is migrated or overwritten.
insert into public.feature_flags (key, enabled_for_all)
values ('project_memory', false) on conflict (key) do nothing;

create table public.project_writing_profiles (
  project_id uuid primary key references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  register text not null default 'auto' check (register in ('auto', 'literary', 'academic', 'technical')),
  genre text not null default '' check (length(genre) <= 120),
  guidance text not null default '' check (length(guidance) <= 2000)
);

create table public.project_memory_chapters (
  chapter_id uuid primary key references public.story_chapters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  revision text not null,
  draft_id uuid,
  writing_kind text not null check (writing_kind in ('literary', 'academic', 'technical', 'general')),
  claims jsonb not null check (jsonb_typeof(claims) = 'array' and jsonb_array_length(claims) <= 40),
  version integer not null default 1,
  analyzed_at timestamptz not null default now()
);
create index on public.project_memory_chapters(project_id);

-- Corrections/exclusions are separate from machine output and survive reanalysis.
create table public.project_memory_overrides (
  chapter_id uuid not null references public.story_chapters(id) on delete cascade,
  claim_key text not null check (length(claim_key) = 64),
  disposition text not null check (disposition in ('confirmed', 'excluded', 'corrected')),
  correction text not null default '' check (length(correction) <= 2000),
  primary key (chapter_id, claim_key),
  check (disposition <> 'corrected' or length(trim(correction)) > 0)
);

create table public.project_memory_jobs (
  chapter_id uuid primary key references public.story_chapters(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  status text not null check (status in ('running', 'complete', 'failed')),
  started_at timestamptz not null default now()
);

alter table public.project_writing_profiles enable row level security;
alter table public.project_memory_chapters enable row level security;
alter table public.project_memory_overrides enable row level security;
alter table public.project_memory_jobs enable row level security;
revoke all on public.project_writing_profiles, public.project_memory_chapters,
  public.project_memory_overrides, public.project_memory_jobs from public, anon, authenticated;
grant all on public.project_writing_profiles, public.project_memory_chapters,
  public.project_memory_overrides, public.project_memory_jobs to service_role;
grant select, insert, update on public.project_writing_profiles to authenticated;

create policy "Owners configure private project memory" on public.project_writing_profiles
for all to authenticated
using (public.can_use_feature('project_memory') and exists (
  select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
))
with check (public.can_use_feature('project_memory') and exists (
  select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
));

-- Internal source resolver: even an empty active draft supersedes older prose.
-- Callers must check ownership. No public execute permission.
create function public.project_memory_source(_project_id uuid, _chapter_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'title', c.title, 'draftId', c.active_draft_id,
    'content', case when d.id is not null then coalesce(d.content, '') else coalesce(c.content, '') end,
    'revision', md5(jsonb_build_array(c.title, c.active_draft_id,
      case when d.id is not null then coalesce(d.content, '') else coalesce(c.content, '') end)::text)
  ) from public.story_chapters c
  left join public.story_chapter_drafts d on d.id = c.active_draft_id and d.chapter_id = c.id
  where c.id = _chapter_id and c.project_id = _project_id;
$$;

create function public.read_project_memory(_project_id uuid)
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

create function public.edit_project_memory_claim(_project_id uuid, _chapter_id uuid,
  _key text, _disposition text, _correction text default '')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_use_feature('project_memory') or not exists (
    select 1 from public.projects p join public.story_chapters c on c.project_id = p.id
    where p.id = _project_id and c.id = _chapter_id and p.user_id = auth.uid()
  ) then raise exception 'Forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.project_memory_chapters m,
    jsonb_array_elements(m.claims) x where m.chapter_id = _chapter_id and x->>'key' = _key)
  then raise exception 'Claim not found'; end if;
  if _disposition = 'extracted' then
    delete from public.project_memory_overrides where chapter_id = _chapter_id and claim_key = _key;
  else
    insert into public.project_memory_overrides(chapter_id, claim_key, disposition, correction)
    values (_chapter_id, _key, _disposition, _correction)
    on conflict (chapter_id, claim_key) do update set
      disposition = excluded.disposition, correction = excluded.correction;
  end if;
end; $$;

-- Service-only lease prevents double clicks, concurrent BYOK calls, and retry
-- duplication before any billable provider request is sent.
create function public.begin_project_memory(_user_id uuid, _project_id uuid, _chapter_id uuid)
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
    and revision = s->>'revision' and version = 1)
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

create function public.finish_project_memory(_user_id uuid, _project_id uuid, _chapter_id uuid,
  _token uuid, _revision text, _claims jsonb, _writing_kind text)
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
  insert into public.project_memory_chapters(chapter_id, project_id, revision, draft_id, writing_kind, claims)
  values (_chapter_id, _project_id, _revision, (s->>'draftId')::uuid, _writing_kind, _claims)
  on conflict (chapter_id) do update set revision = excluded.revision,
    draft_id = excluded.draft_id, writing_kind = excluded.writing_kind, claims = excluded.claims,
    analyzed_at = now(), version = 1;
  update public.project_memory_jobs set status = 'complete' where chapter_id = _chapter_id and token = _token;
end; $$;

create function public.fail_project_memory(_chapter_id uuid, _token uuid)
returns void language sql security definer set search_path = '' as $$
  update public.project_memory_jobs set status = 'failed'
  where chapter_id = _chapter_id and token = _token and status = 'running';
$$;

revoke all on function public.project_memory_source(uuid, uuid),
  public.begin_project_memory(uuid, uuid, uuid),
  public.finish_project_memory(uuid, uuid, uuid, uuid, text, jsonb, text),
  public.fail_project_memory(uuid, uuid), public.read_project_memory(uuid),
  public.edit_project_memory_claim(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.begin_project_memory(uuid, uuid, uuid),
  public.finish_project_memory(uuid, uuid, uuid, uuid, text, jsonb, text),
  public.fail_project_memory(uuid, uuid) to service_role;
grant execute on function public.read_project_memory(uuid),
  public.edit_project_memory_claim(uuid, uuid, text, text, text) to authenticated;
notify pgrst, 'reload schema';
