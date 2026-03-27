import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  activeRole: AppRole | null;
  setActiveRole: (role: AppRole) => void;
  profile: ProfileData | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isOwner: boolean;
  isManagement: boolean;
  isOnboardingStaff: boolean;
  isDispatcher: boolean;
  isOperator: boolean;
  isApplicant: boolean;
  isStaff: boolean;
}

interface ProfileData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  account_status: string;
  avatar_url: string | null;
}

// Export context so Vite HMR can preserve it across hot reloads
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (data) {
      const userRoles = data.map(r => r.role as AppRole);
      setRoles(userRoles);
      
      // Set default active role based on priority
      const rolePriority: AppRole[] = ['owner', 'management', 'onboarding_staff', 'dispatcher', 'operator', 'applicant'];
      const defaultRole = rolePriority.find(r => userRoles.includes(r)) || userRoles[0] || null;
      
      // Restore saved role preference if still valid
      const savedRole = localStorage.getItem(`activeRole_${userId}`) as AppRole | null;
      if (savedRole && userRoles.includes(savedRole)) {
        setActiveRoleState(savedRole);
      } else {
        setActiveRoleState(defaultRole);
      }
    }
  };

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone, home_state, account_status, avatar_url')
      .eq('user_id', userId)
      .single();
    
    if (data) setProfile(data as ProfileData);
  };

  useEffect(() => {
    // Primary source of truth: getSession restores from storage
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await Promise.all([
          fetchRoles(session.user.id),
          fetchProfile(session.user.id),
        ]);
      } else {
        setRoles([]);
        setActiveRoleState(null);
        setProfile(null);
      }
      setLoading(false);
    });

    // IMPORTANT: No await inside onAuthStateChange — causes deadlock with Supabase client
    // Use fire-and-forget pattern for subsequent auth events (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        // Fire-and-forget — do NOT await here
        fetchRoles(session.user.id);
        fetchProfile(session.user.id);
      } else {
        setRoles([]);
        setActiveRoleState(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const setActiveRole = (role: AppRole) => {
    if (user && roles.includes(role)) {
      setActiveRoleState(role);
      localStorage.setItem(`activeRole_${user.id}`, role);
    }
  };

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id);
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isManagement = roles.includes('management');
  const isOnboardingStaff = roles.includes('onboarding_staff');
  const isDispatcher = roles.includes('dispatcher');
  const isOperator = roles.includes('operator');
  const isApplicant = roles.includes('applicant');
  const isStaff = isManagement || isOnboardingStaff || isDispatcher;

  return (
    <AuthContext.Provider value={{
      user, session, roles, activeRole, setActiveRole,
      profile, loading, refreshProfile,
      signIn, signOut,
      isManagement, isOnboardingStaff, isDispatcher,
      isOperator, isApplicant, isStaff,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
