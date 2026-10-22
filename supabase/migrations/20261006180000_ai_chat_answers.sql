-- AI Editor answers as they're written, so a writer who reloads the page (or
-- loses the connection) mid-answer can pick it back up. story-chat keeps
-- reading the model after the browser goes away, saves the answer here as it
-- grows, and settles the charge when it ends, which also frees the one-request
-- lock instead of holding it until the reservation expires.
create table if not exists public.ai_chat_answers (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- The model's raw output so far: status lines, divider and answer.
  content text not null default '',
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  credits integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_answers_user_created_idx
  on public.ai_chat_answers (user_id, created_at desc);

alter table public.ai_chat_answers enable row level security;
revoke all on public.ai_chat_answers from public, anon;
grant select on public.ai_chat_answers to authenticated;

-- Only the edge function (service role) writes; writers read their own.
create policy "Users read their own AI chat answers" on public.ai_chat_answers
  for select to authenticated
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
