import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BLANK_MAP_BACKGROUND_COLOR } from '@/lib/map-constants';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import i18n from '@/i18n';

export interface Project {
  id: string;
  user_id: string;
  title: string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
  is_starter?: boolean;
}

export function useProjects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProjects = useCallback(async () => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('projects' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('position', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw error;

      let projectList = (data as unknown as Project[]) || [];

      if (projectList.length === 0) {
        // Only seed when the session really is valid — a rejected JWT also
        // returns zero rows and must not spawn a bogus "Default" project.
        const { data: verified, error: verifyError } = await supabase.auth.getUser();
        if (verifyError || verified?.user?.id !== user.id) {
          setProjects([]);
          setLoading(false);
          return;
        }
        // Idempotent per-user starter: clones the template project if one exists,
        // otherwise creates a "Default" project. Uses an advisory lock server-side
        // to prevent StrictMode/double-mount from creating duplicates.
        const { error: rpcError } = await supabase.rpc('ensure_starter_project' as any, {
          _user_id: user.id,
        });

        if (!rpcError) {
          const { data: refetched } = await supabase
            .from('projects' as any)
            .select('*')
            .eq('user_id', user.id)
            .order('position', { ascending: true })
            .order('created_at', { ascending: false });
          projectList = (refetched as unknown as Project[]) || [];
        }
      }

      setProjects(projectList);
    } catch (error: any) {
      toast({
        title: i18n.t('projects.errorLoading'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const createProject = async (title: string = i18n.t('dashboard.newProject')): Promise<Project | null> => {
    if (!user) return null;
    try {
      let aiLanguage = i18n.language || 'en';
      try {
        const { data: prof } = await supabase
          .from('profiles')
          .select('preferred_language')
          .eq('user_id', user.id)
          .maybeSingle();
        if ((prof as any)?.preferred_language) aiLanguage = (prof as any).preferred_language;
      } catch { /* fall back to UI language */ }
      const { data, error } = await supabase
        .from('projects' as any)
        .insert({ user_id: user.id, title, icon: '📁', position: projects.length, ai_language: aiLanguage } as any)
        .select()
        .single();
      if (error) throw error;
      const project = data as unknown as Project;
      await supabase.from('map_canvas').insert({
        user_id: user.id,
        project_id: project.id,
        title: i18n.t('map.worldMap'),
        position: 0,
        bg_color: BLANK_MAP_BACKGROUND_COLOR,
      } as any);
      setProjects(prev => [...prev, project]);
      return project;
    } catch (error: any) {
      toast({ title: i18n.t('projects.errorCreating'), description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const reorderProjects = async (reordered: Project[]) => {
    setProjects(reordered);
    try {
      await Promise.all(
        reordered.map((p, i) =>
          supabase.from('projects' as any).update({ position: i } as any).eq('id', p.id)
        )
      );
    } catch (error: any) {
      toast({ title: i18n.t('projects.errorReordering'), description: error.message, variant: 'destructive' });
      fetchProjects();
    }
  };

  return { projects, loading, createProject, reorderProjects, refetch: fetchProjects };
}
