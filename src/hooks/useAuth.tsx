import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { appendAuthTrace } from '@/lib/navTrace';

type AppRole = Database['public']['Enums']['app_role'];

interface AuthContextType {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  activeRole: AppRole | null;
  setActiveRole: (role: AppRole) => void;
  profile: ProfileData | null;
  loading: boolean;
  /** True once fetchRoles has completed at least once for the current user. */
  rolesLoaded: boolean;
  /**
   * Non-null when the profile read failed outright (permission, network, or any
   * PostgREST error). A degraded session must be visible — consumers render a
   * banner rather than silently behaving as if the user had no profile.
   */
  profileError: string | null;
  /** True when the read succeeded but the user genuinely has no profile row. */
  profileMissing: boolean;
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
  isTruckOwner: boolean;
}

export interface ProfileData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  home_state: string | null;
  home_country: string | null;
  birth_month: number | null;
  birth_day: number | null;
  account_status: string;
  avatar_url: string | null;
}

const PROFILE_COLUMNS =
  'id, first_name, last_name, phone, home_state, home_country, birth_month, birth_day, account_status, avatar_url';

/**
 * Outcome of the sign-in profile read. The three cases are deliberately distinct:
 * a new user with no row yet is a real state, an error is a defect, and neither
 * may be collapsed into `if (data)` — that collapse is what produced silent
 * degraded sessions.
 */
export type ProfileLoadResult =
  | { status: 'ok'; profile: ProfileData }
  | { status: 'missing' }
  | { status: 'error'; message: string; code?: string };

type MinimalClient = Pick<typeof supabase, 'from'>;

export async function loadProfile(
  client: MinimalClient,
  userId: string,
): Promise<ProfileLoadResult> {
  const { data, error } = await client
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('user_id', userId)
    // maybeSingle, not single: "no row" must not arrive dressed up as an error.
    .maybeSingle();

  if (error) {
    return { status: 'error', message: error.message, code: (error as { code?: string }).code };
  }
  if (!data) return { status: 'missing' };
  return { status: 'ok', profile: data as unknown as ProfileData };
}

/**
 * Activate a pending account. Returns true ONLY when a row was actually written.
 * A zero-row update is not success — it means RLS filtered the row out or the
 * user id did not match, and the UI must keep showing `pending`.
 */
export async function activatePendingProfile(
  client: MinimalClient,
  userId: string,
): Promise<{ activated: boolean; message?: string }> {
  const { data, error } = await client
    .from('profiles')
    .update({ account_status: 'active' as never })
    .eq('user_id', userId)
    .select('id');

  if (error) return { activated: false, message: error.message };
  if (!data || data.length === 0) {
    return { activated: false, message: 'pending → active update affected zero rows' };
  }
  return { activated: true };
}

const LOGIN_PATH = '/login';

function clearLocalAuthSession() {
  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore storage access failures; signOut still attempts to clear the session.
  }
}

function replaceWithLogin() {
  window.location.replace(`${window.location.origin}${LOGIN_PATH}`);
}

// Export context so Vite HMR can preserve it across hot reloads
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activeRole, setActiveRoleState] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  // Tracks the user.id for whom fetchRoles has completed at least once. Guards
  // downstream route protection from redirecting during a transient re-fetch
  // window (e.g. right after TOKEN_REFRESHED) where `roles` briefly looks empty
  // even though the user is a valid operator/staff member.
  const [rolesLoadedFor, setRolesLoadedFor] = useState<string | null>(null);

  const fetchRoles = async (userId: string) => {
    appendAuthTrace({ event: 'fetch-roles-start', userId: userId.slice(0, 8) });
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
    setRolesLoadedFor(userId);
    appendAuthTrace({
      event: 'fetch-roles-end',
      userId: userId.slice(0, 8),
      roleCount: data?.length ?? 0,
    });
  };

  const fetchProfile = async (userId: string) => {
    setProfileError(null);
    setProfileMissing(false);

    const read = await loadProfile(supabase, userId);

    if (read.status === 'error') {
      console.error('[useAuth] profile read failed:', read.message, read.code);
      appendAuthTrace({
        event: 'profile-read-failed',
        userId: userId.slice(0, 8),
        message: read.message,
        code: read.code,
      });
      setProfileError(read.message);
      setProfile(null);
      return;
    }

    if (read.status === 'missing') {
      appendAuthTrace({
        event: 'profile-missing',
        userId: userId.slice(0, 8),
      });
      setProfileMissing(true);
      setProfile(null);
      return;
    }

    const data = read.profile;
    setProfile(data);

    // Auto-upgrade pending → active on login, but only after confirming it wrote.
    if (data.account_status === 'pending') {
      activatePendingProfile(supabase, userId).then((result) => {
        if (result.activated) {
          setProfile(prev => (prev ? { ...prev, account_status: 'active' } : prev));
        } else {
          console.error('[useAuth] pending → active update failed:', result.message);
          appendAuthTrace({
            event: 'profile-activate-failed',
            userId: userId.slice(0, 8),
            message: result.message,
          });
        }
      });
    }
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
        setProfileError(null);
        setProfileMissing(false);
      }
      setLoading(false);
    });

    // IMPORTANT: No await inside onAuthStateChange — causes deadlock with Supabase client
    // Use fire-and-forget pattern for subsequent auth events (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      appendAuthTrace({
        event: 'auth-state-change',
        supabaseEvent: event,
        hasSession: !!session,
        userId: session?.user?.id?.slice(0, 8) ?? null,
      });
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
        setProfileError(null);
        setProfileMissing(false);
        setRolesLoadedFor(null);
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
    // Treat logout as a hard app boundary. The previous SPA-only route swap could
    // leave protected dashboard state half-unmounted, causing the blank screen.
    setLoading(true);
    setUser(null);
    setSession(null);
    setRoles([]);
    setActiveRoleState(null);
    setProfile(null);
    setProfileError(null);
    setProfileMissing(false);

    clearLocalAuthSession();

    const redirectFallback = window.setTimeout(replaceWithLogin, 400);

    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      // Ignore — local storage/session has already been cleared.
    } finally {
      window.clearTimeout(redirectFallback);
      clearLocalAuthSession();
      replaceWithLogin();
    }
  };

  const isOwner = roles.includes('owner');
  const isManagement = roles.includes('management') || isOwner;
  const isOnboardingStaff = roles.includes('onboarding_staff');
  const isDispatcher = roles.includes('dispatcher');
  const isOperator = roles.includes('operator');
  const isApplicant = roles.includes('applicant');
  const isStaff = isManagement || isOnboardingStaff || isDispatcher;
  const isTruckOwner = roles.includes('truck_owner');
  const rolesLoaded = !!user && rolesLoadedFor === user.id;

  return (
    <AuthContext.Provider value={{
      user, session, roles, activeRole, setActiveRole,
      profile, loading, rolesLoaded, profileError, profileMissing,
      refreshProfile,
      signIn, signOut,
      isOwner, isManagement, isOnboardingStaff, isDispatcher,
      isOperator, isApplicant, isStaff, isTruckOwner,
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
