-- More kinds of writing for project memory: memoir and non-fiction, scripts
-- (film, TV, video, stage, comics) and worldbuilding or game material, beside
-- fiction ("literary"), academic and technical. Used both for the author's
-- writing type and for the type detected in each analyzed chapter.

alter table public.project_writing_profiles
  drop constraint if exists project_writing_profiles_register_check;
alter table public.project_writing_profiles
  add constraint project_writing_profiles_register_check
  check (register in ('auto', 'literary', 'nonfiction', 'script', 'worldbuilding', 'academic', 'technical'));

alter table public.project_memory_chapters
  drop constraint if exists project_memory_chapters_writing_kind_check;
alter table public.project_memory_chapters
  add constraint project_memory_chapters_writing_kind_check
  check (writing_kind in ('literary', 'nonfiction', 'script', 'worldbuilding', 'academic', 'technical', 'general'));
