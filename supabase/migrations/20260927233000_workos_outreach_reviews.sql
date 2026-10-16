-- Shared marketing review state. Public research is versioned in private WorkOS GitHub.
begin;
create table if not exists public.workos_outreach_reviews (
 prospect_id text primary key check (prospect_id ~ '^[a-z0-9][a-z0-9-]{0,99}$'),
 status text not null default 'review' check (status in ('review','shortlisted','contacted','replied','closed','do_not_contact')),
 subject text not null default '' check (length(subject)<=300),
 body text not null default '' check (length(body)<=12000),
 notes text not null default '' check (length(notes)<=6000),
 follow_up_on date,
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.workos_outreach_reviews enable row level security;
revoke all on public.workos_outreach_reviews from public, anon, authenticated;
create or replace function public.workos_outreach_reviews_read()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'admin'::public.app_role) then
  raise exception 'Storymode admin access required' using errcode='42501';
 end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'prospectId',prospect_id,'status',status,'subject',subject,'body',body,'notes',notes,
  'followUpOn',follow_up_on,'version',version,'updatedAt',updated_at
 ) order by updated_at desc) from public.workos_outreach_reviews),'[]'::jsonb);
end; $$;
create or replace function public.workos_outreach_review_save(p_id text,p_status text,p_subject text,p_body text,p_notes text,p_follow_up date,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved public.workos_outreach_reviews;
begin
 if auth.uid() is null or not public.has_role(auth.uid(),'admin'::public.app_role) then
  raise exception 'Storymode admin access required' using errcode='42501';
 end if;
 if p_expected_version is null or p_expected_version < 0 then
  raise exception 'Invalid expected version' using errcode='22023';
 end if;
 if p_expected_version=0 then
  insert into public.workos_outreach_reviews(prospect_id,status,subject,body,notes,follow_up_on,updated_by)
  values(p_id,p_status,p_subject,p_body,p_notes,p_follow_up,auth.uid())
  on conflict(prospect_id) do nothing returning * into saved;
 else
  update public.workos_outreach_reviews set status=p_status,subject=p_subject,body=p_body,notes=p_notes,
  follow_up_on=p_follow_up,version=version+1,updated_at=now(),updated_by=auth.uid()
  where prospect_id=p_id and version=p_expected_version returning * into saved;
 end if;
 if saved.prospect_id is null then raise exception 'This prospect was updated elsewhere. Reload before saving.' using errcode='40001'; end if;
 return jsonb_build_object('prospectId',saved.prospect_id,'status',saved.status,'subject',saved.subject,'body',saved.body,'notes',saved.notes,'followUpOn',saved.follow_up_on,'version',saved.version,'updatedAt',saved.updated_at);
end; $$;
revoke all on function public.workos_outreach_reviews_read() from public,anon;
revoke all on function public.workos_outreach_review_save(text,text,text,text,text,date,integer) from public,anon;
grant execute on function public.workos_outreach_reviews_read() to authenticated;
grant execute on function public.workos_outreach_review_save(text,text,text,text,text,date,integer) to authenticated;
notify pgrst,'reload schema';
commit;
-- Rollback: revoke authenticated execution of both functions; preserve table and drafts.
