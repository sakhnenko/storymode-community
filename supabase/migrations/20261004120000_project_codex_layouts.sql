-- How the author arranged the Codex for a project: the order of places in
-- Journeys, places hidden or opened, which place is inside which, and the
-- width of the place column. Kept per project so it follows the author
-- across browsers and devices.

create table if not exists public.project_codex_layouts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  layout jsonb not null default '{}'::jsonb
    check (jsonb_typeof(layout) = 'object' and pg_column_size(layout) <= 65536),
  updated_at timestamptz not null default now()
);
alter table public.project_codex_layouts enable row level security;
revoke all on public.project_codex_layouts from public, anon, authenticated;
grant select, insert, update on public.project_codex_layouts to authenticated;
grant all on public.project_codex_layouts to service_role;

create policy "Owners arrange their Codex" on public.project_codex_layouts
for all to authenticated
using (public.can_use_feature('project_memory') and exists (
  select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
))
with check (public.can_use_feature('project_memory') and exists (
  select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
));

notify pgrst, 'reload schema';
