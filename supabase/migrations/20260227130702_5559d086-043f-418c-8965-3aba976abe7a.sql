
-- =============================================
-- 1. PROJECT SHARES TABLE (replaces canvas_shares for project-level sharing)
-- =============================================
CREATE TABLE public.project_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  shared_with_email text NOT NULL,
  shared_with_user_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_shares ENABLE ROW LEVEL SECURITY;

-- Owner policies
CREATE POLICY "Owners can create project shares"
  ON public.project_shares FOR INSERT
  WITH CHECK (auth.uid() = owner_id AND EXISTS (
    SELECT 1 FROM public.projects WHERE projects.id = project_shares.project_id AND projects.user_id = auth.uid()
  ));

CREATE POLICY "Owners can view project shares"
  ON public.project_shares FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can update project shares"
  ON public.project_shares FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete project shares"
  ON public.project_shares FOR DELETE
  USING (auth.uid() = owner_id);

-- Recipient policies
CREATE POLICY "Recipients can view their project shares"
  ON public.project_shares FOR SELECT
  USING (auth.uid() = shared_with_user_id OR shared_with_email = get_current_user_email());

CREATE POLICY "Recipients can update their project share status"
  ON public.project_shares FOR UPDATE
  USING (auth.uid() = shared_with_user_id);

-- Trigger for updated_at
CREATE TRIGGER update_project_shares_updated_at
  BEFORE UPDATE ON public.project_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. ADD RLS POLICIES for shared project access to notebook_grids, notepads, map_canvas
-- =============================================

-- notebook_grids: shared users can view grids in shared projects
CREATE POLICY "Shared project users can view grids"
  ON public.notebook_grids FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = notebook_grids.project_id
      AND project_shares.status = 'accepted'
      AND (project_shares.shared_with_user_id = auth.uid() OR project_shares.shared_with_email = get_current_user_email())
  ));

-- notepads: shared project users can view/edit notepads
CREATE POLICY "Shared project users can view notepads"
  ON public.notepads FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND (ps.shared_with_user_id = auth.uid() OR ps.shared_with_email = get_current_user_email())
  ));

CREATE POLICY "Shared project users can create notepads"
  ON public.notepads FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND (ps.shared_with_user_id = auth.uid() OR ps.shared_with_email = get_current_user_email())
  ));

CREATE POLICY "Shared project users can update notepads"
  ON public.notepads FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND (ps.shared_with_user_id = auth.uid() OR ps.shared_with_email = get_current_user_email())
  ));

CREATE POLICY "Shared project users can delete notepads"
  ON public.notepads FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.notebook_grids ng
    JOIN public.project_shares ps ON ps.project_id = ng.project_id
    WHERE ng.id = notepads.grid_id
      AND ps.status = 'accepted'
      AND (ps.shared_with_user_id = auth.uid() OR ps.shared_with_email = get_current_user_email())
  ));

-- map_canvas: shared project users can view/edit maps
CREATE POLICY "Shared project users can view maps"
  ON public.map_canvas FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND (project_shares.shared_with_user_id = auth.uid() OR project_shares.shared_with_email = get_current_user_email())
  ));

CREATE POLICY "Shared project users can update maps"
  ON public.map_canvas FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = map_canvas.project_id
      AND project_shares.status = 'accepted'
      AND (project_shares.shared_with_user_id = auth.uid() OR project_shares.shared_with_email = get_current_user_email())
  ));

-- Projects: shared users can view shared projects
CREATE POLICY "Shared users can view shared projects"
  ON public.projects FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.project_shares
    WHERE project_shares.project_id = projects.id
      AND project_shares.status = 'accepted'
      AND (project_shares.shared_with_user_id = auth.uid() OR project_shares.shared_with_email = get_current_user_email())
  ));

-- =============================================
-- 3. PROFILES TABLE
-- =============================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view any profile"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- 4. AVATARS STORAGE BUCKET
-- =============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
