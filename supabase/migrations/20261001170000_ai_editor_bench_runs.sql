-- Runs of the AI editor benchmark (Admin → AI editor benchmark, or
-- scripts/editor-bench-live.ts): what each request cost and how long it took,
-- with one run marked as the baseline later runs are compared with.
create table public.ai_editor_bench_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  options jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  is_baseline boolean not null default false
);

create unique index ai_editor_bench_runs_one_baseline on public.ai_editor_bench_runs (is_baseline) where is_baseline;
create index ai_editor_bench_runs_created_idx on public.ai_editor_bench_runs (created_at desc);

alter table public.ai_editor_bench_runs enable row level security;
revoke all on public.ai_editor_bench_runs from public, anon;
grant select, insert, update, delete on public.ai_editor_bench_runs to authenticated;

create policy "Admins manage AI editor benchmark runs" on public.ai_editor_bench_runs
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

notify pgrst, 'reload schema';
