import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string | null;
  created_at: string;
  updated_at: string;
}

// Header instances remount while moving between project/folio routes. Retain
// the last confirmed profile so those remounts never fall back to an email
// handle while the same profile is fetched again.
const profileCache = new Map<string, Profile>();

export function useProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const cachedProfile = user ? profileCache.get(user.id) ?? null : null;
  const [profile, setProfile] = useState<Profile | null>(cachedProfile);
  const [loading, setLoading] = useState(!cachedProfile);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(
    cachedProfile && user ? user.id : null,
  );

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      setResolvedUserId(null);
      return;
    }

    const cached = profileCache.get(user.id);
    if (cached) {
      setProfile(cached);
      setLoading(false);
      setResolvedUserId(user.id);
    } else {
      setProfile(null);
      setLoading(true);
      setResolvedUserId(null);
    }

    try {
      const { data, error } = await supabase
        .from('profiles' as any)
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Create profile if it doesn't exist (for existing users)
        const { data: newProfile, error: createError } = await supabase
          .from('profiles' as any)
          .insert({ user_id: user.id } as any)
          .select()
          .single();

        if (createError) throw createError;
        const created = newProfile as unknown as Profile;
        profileCache.set(user.id, created);
        setProfile(created);
      } else {
        const loaded = data as unknown as Profile;
        profileCache.set(user.id, loaded);
        setProfile(loaded);
      }
    } catch (error: any) {
      console.error('Error fetching profile:', error);
    } finally {
      // Mark this identity as resolved even when the profile request failed;
      // Header may then use the email fallback instead of showing a permanent
      // loading placeholder. Until this point it must never flash that fallback.
      setResolvedUserId(user.id);
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = async (updates: Partial<Pick<Profile, 'display_name' | 'avatar_url' | 'preferred_language'>>) => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('profiles' as any)
        .update(updates as any)
        .eq('user_id', user.id);

      if (error) throw error;
      setProfile((prev) => {
        if (!prev) return null;
        const updated = { ...prev, ...updates };
        profileCache.set(user.id, updated);
        return updated;
      });
      return true;
    } catch (error: any) {
      toast({ title: 'Error updating profile', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const uploadAvatar = async (file: File): Promise<string | null> => {
    if (!user) return null;

    try {
      const ALLOWED_TYPES: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
      };
      const ext = ALLOWED_TYPES[file.type];
      if (!ext) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a JPEG, PNG, GIF, or WebP image.',
          variant: 'destructive',
        });
        return null;
      }
      const filePath = `${user.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Add cache-buster
      const url = `${publicUrl}?t=${Date.now()}`;
      await updateProfile({ avatar_url: url });
      return url;
    } catch (error: any) {
      toast({ title: 'Error uploading avatar', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const changePassword = async (newPassword: string): Promise<boolean> => {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast({ title: 'Password updated', description: 'Your password has been changed successfully.' });
      return true;
    } catch (error: any) {
      toast({ title: 'Error changing password', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const deleteAccount = async (): Promise<boolean> => {
    // Note: full account deletion requires admin/edge function. For now, sign out.
    // A proper implementation would use an edge function with service role.
    toast({
      title: 'Account deletion requested',
      description: 'Please contact support to complete account deletion.',
    });
    return false;
  };

  const activeProfile = user && profile?.user_id === user.id ? profile : null;
  const profileLoading = Boolean(user && resolvedUserId !== user.id) || loading;

  return {
    profile: activeProfile,
    loading: profileLoading,
    updateProfile,
    uploadAvatar,
    changePassword,
    deleteAccount,
    refetch: fetchProfile,
  };
}
