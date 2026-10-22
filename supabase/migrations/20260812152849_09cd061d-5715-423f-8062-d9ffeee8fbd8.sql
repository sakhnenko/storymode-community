ALTER POLICY "Users can update their own grid layout" ON public.grid_layouts WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update their own map" ON public.map_canvas WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update their own grids" ON public.notebook_grids WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update their own notepads" ON public.notepads WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update their own profile" ON public.profiles WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Users can update their own projects" ON public.projects WITH CHECK (auth.uid() = user_id);
ALTER POLICY "Admins can update all plans" ON public.user_plans WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
ALTER POLICY "Admins can update waitlist" ON public.waitlist WITH CHECK (has_role(auth.uid(), 'admin'::app_role));