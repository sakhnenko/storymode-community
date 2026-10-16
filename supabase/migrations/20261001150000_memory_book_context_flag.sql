-- Memory-first answers to book-wide questions in the AI editor: project memory
-- and the passages that matter instead of every chapter's full text. Admins
-- get it first (can_use_feature); it also needs project memory to be on.
insert into public.feature_flags (key, enabled_for_all)
values ('memory_book_context', false)
on conflict (key) do nothing;
