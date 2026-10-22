-- Which AI provider family serves each tier when the server uses OpenRouter
-- (self-hosted installs): Google, OpenAI or Anthropic for Fast, Thoughtful
-- and Creative (background work follows Fast), Google or OpenAI for images.
-- OpenRouter uses the admin's own provider key for a family when they've
-- added one there. One row; the defaults are the models the app has always
-- used. With the Lovable gateway (the hosted app) this table isn't read.
create table if not exists public.ai_model_settings (
  singleton boolean primary key default true check (singleton),
  fast text not null default 'google' check (fast in ('google', 'openai', 'anthropic')),
  thoughtful text not null default 'google' check (thoughtful in ('google', 'openai', 'anthropic')),
  creative text not null default 'openai' check (creative in ('google', 'openai', 'anthropic')),
  images text not null default 'google' check (images in ('google', 'openai')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.ai_model_settings (singleton) values (true) on conflict (singleton) do nothing;

alter table public.ai_model_settings enable row level security;
revoke all on public.ai_model_settings from public, anon;
grant select, update on public.ai_model_settings to authenticated;

create policy "Admins read AI model settings" on public.ai_model_settings
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

create policy "Admins update AI model settings" on public.ai_model_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

notify pgrst, 'reload schema';
