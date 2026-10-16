ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS ai_language text NOT NULL DEFAULT 'en';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_ai_language_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_ai_language_chk CHECK (ai_language IN ('en','pt-BR'));