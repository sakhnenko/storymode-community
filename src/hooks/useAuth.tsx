import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Distinguish "the auth server rejected this token" from "we couldn't reach the
// auth server". Only the former should ever destroy the stored session — a
// network hiccup must leave the user signed in.
function isAuthRejection(error: any): boolean {
  if (!error) return false;
  const status = error.status ?? error?.context?.status;
  if (status === 401 || status === 403) return true;
  const code = String(error.code ?? '').toLowerCase();
  if (code === 'bad_jwt' || code === 'session_not_found' || code === 'user_not_found') return true;
  const msg = String(error.message ?? '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('timeout')) {
    return false;
  }
  return /jwt|token|session|not authenticated|unauthorized/.test(msg) && !!status;
}

// Remove any leftover Supabase auth tokens so a stale session can never survive
// a sign-out or bleed into the next sign-in.
function clearAuthStorage() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.includes('auth-token'))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);

        // Sharing/collaboration is disabled; no pending invitations are accepted.
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        // A stored token can be structurally valid but rejected by the auth
        // server (e.g. "missing sub claim" / bad_jwt). In that case RLS sees no
        // user and the app looks like a brand-new empty account. Validate the
        // token, try one refresh, and otherwise drop it so the user re-logs in.
        const { error } = await supabase.auth.getUser();
        if (error && !isAuthRejection(error)) {
          // Transport/offline failure: keep the stored session as-is.
          setSession(session);
          setUser(session.user);
          setLoading(false);
          return;
        }
        if (error) {
          const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError && !isAuthRejection(refreshError)) {
            setSession(session);
            setUser(session.user);
            setLoading(false);
            return;
          }
          if (refreshError || !refreshed.session) {
            try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* ignore */ }
            clearAuthStorage();
            setSession(null);
            setUser(null);
            setLoading(false);
            return;
          }
          setSession(refreshed.session);
          setUser(refreshed.session.user);
          setLoading(false);
          return;
        }
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });


    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    // Purge any stale session first, so a failed/blocked sign-in can never leave
    // the previous account signed in and look like a successful login.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // ignore
    }
    clearAuthStorage();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    // Clear local state first to ensure UI updates immediately
    setSession(null);
    setUser(null);
    // Then attempt to sign out from Supabase (ignore errors if session already expired)
    try {
      await supabase.auth.signOut();
    } catch (error) {
      // Session may already be expired/invalidated - this is fine
      console.log('Sign out completed (session may have already expired)');
    }
    // Make sure no token survives in storage (e.g. when the network call fails)
    clearAuthStorage();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
