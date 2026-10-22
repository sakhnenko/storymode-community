-- Disable project/canvas sharing (only public/private projects remain)
-- Drops all RLS policies that grant access through project_shares or canvas_shares.

-- canvas_shares: no owner/recipient access needed while sharing is disabled
DROP POLICY IF EXISTS "Owners can create shares" ON public.canvas_shares;
DROP POLICY IF EXISTS "Owners can delete shares" ON public.canvas_shares;
DROP POLICY IF EXISTS "Owners can update shares" ON public.canvas_shares;
DROP POLICY IF EXISTS "Owners can view shares for their canvases" ON public.canvas_shares;
DROP POLICY IF EXISTS "Recipients can update their share status" ON public.canvas_shares;
DROP POLICY IF EXISTS "Users can view their own received shares" ON public.canvas_shares;

-- map_canvas: remove shared-project edit/view paths
DROP POLICY IF EXISTS "Shared project users can update maps" ON public.map_canvas;
DROP POLICY IF EXISTS "Shared project users can view maps" ON public.map_canvas;

-- notebook_grids: remove shared-project and direct-canvas share view paths
DROP POLICY IF EXISTS "Shared project users can view grids" ON public.notebook_grids;
DROP POLICY IF EXISTS "Shared users can view grids shared with them" ON public.notebook_grids;

-- notepads: remove all shared-project and direct-canvas share CRUD paths
DROP POLICY IF EXISTS "Shared project users can create notepads" ON public.notepads;
DROP POLICY IF EXISTS "Shared project users can delete notepads" ON public.notepads;
DROP POLICY IF EXISTS "Shared project users can update notepads" ON public.notepads;
DROP POLICY IF EXISTS "Shared project users can view notepads" ON public.notepads;
DROP POLICY IF EXISTS "Shared users can create notepads in shared grids" ON public.notepads;
DROP POLICY IF EXISTS "Shared users can delete notepads in shared grids" ON public.notepads;
DROP POLICY IF EXISTS "Shared users can update notepads in shared grids" ON public.notepads;
DROP POLICY IF EXISTS "Shared users can view notepads in shared grids" ON public.notepads;

-- project_shares: no owner/recipient access needed while sharing is disabled
DROP POLICY IF EXISTS "Owners can create project shares" ON public.project_shares;
DROP POLICY IF EXISTS "Owners can delete project shares" ON public.project_shares;
DROP POLICY IF EXISTS "Owners can update project shares" ON public.project_shares;
DROP POLICY IF EXISTS "Owners can view project shares" ON public.project_shares;
DROP POLICY IF EXISTS "Recipients can update their project share status" ON public.project_shares;
DROP POLICY IF EXISTS "Recipients can view their project shares" ON public.project_shares;

-- projects: remove shared-project view path
DROP POLICY IF EXISTS "Shared users can view shared projects" ON public.projects;

-- story_chapters: remove all shared-user chapter paths
DROP POLICY IF EXISTS "Shared users can delete their own chapters" ON public.story_chapters;
DROP POLICY IF EXISTS "Shared users can insert chapters" ON public.story_chapters;
DROP POLICY IF EXISTS "Shared users can read chapters" ON public.story_chapters;
DROP POLICY IF EXISTS "Shared users can update chapters" ON public.story_chapters;