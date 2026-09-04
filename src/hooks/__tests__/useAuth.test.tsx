import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '@/hooks/useAuth';

/**
 * `useAuth` profile-load behaviour.
 *
 * The 2026-09-04 fix replaced the silent `if (data)` collapse with explicit
 * handling of three cases: success, missing row, and error. These tests guard
 * that the distinction survives and that the pending → active activation only
 * updates local state when the database actually wrote a row.
 */

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signOut = vi.fn();

// Per-table queues so reads, role reads, and updates are routed independently.
const profileReadQueue: Array<() => Promise<{ data?: unknown; error?: { message: string; code?: string } | null }>> = [];
const rolesReadQueue: Array<() => Promise<{ data?: unknown }>> = [];
const profileUpdateQueue: Array<() => Promise<{ data?: unknown[]; error?: { message: string; code?: string } | null }>> = [];

function from(...args: unknown[]) {
  const table = args[0] as string;
  if (table === 'profiles') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: profileReadQueue.shift() ?? (async () => ({ data: null })),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: profileUpdateQueue.shift() ?? (async () => ({ data: [] })),
        }),
      }),
    };
  }
  if (table === 'user_roles') {
    return {
      select: () => ({
        eq: () => ({
          // fetchRoles destructures `data` directly from the eq() result, not from maybeSingle/single.
          then: async (cb: (v: { data: unknown }) => unknown) => {
            const fn = rolesReadQueue.shift() ?? (async () => ({ data: [] }));
            const value = await fn();
            return cb(value as { data: unknown });
          },
        }),
      }),
    };
  }
  return {};
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...a: unknown[]) => from(...a),
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      onAuthStateChange: (...a: unknown[]) => onAuthStateChange(...a),
      signOut: (...a: unknown[]) => signOut(...a),
    },
  },
}));

function TestConsumer() {
  const { profile, profileError, profileMissing, loading } = useAuth();
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'ready'}</div>
      <div data-testid="profile-status">{profile ? 'has-profile' : profileError ? 'error' : profileMissing ? 'missing' : 'none'}</div>
      <div data-testid="account-status">{profile?.account_status ?? '—'}</div>
      <div data-testid="error-text">{profileError ?? '—'}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
  );
}

const USER_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '00000000-0000-0000-0000-000000000002';

function baseProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFILE_ID,
    first_name: 'Marcus',
    last_name: 'Mueller',
    phone: null,
    home_state: 'MO',
    home_country: 'US',
    birth_month: null,
    birth_day: null,
    account_status: 'active',
    avatar_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  profileReadQueue.length = 0;
  rolesReadQueue.length = 0;
  profileUpdateQueue.length = 0;
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});

describe('useAuth profile load', () => {
  it('loads an active profile and reports ready', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    profileReadQueue.push(async () => ({ data: baseProfile() }));
    rolesReadQueue.push(async () => ({ data: [] }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    expect(screen.getByTestId('profile-status').textContent).toBe('has-profile');
    expect(screen.getByTestId('account-status').textContent).toBe('active');
    expect(screen.getByTestId('error-text').textContent).toBe('—');
  });

  it('distinguishes a genuinely missing profile from an error', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    profileReadQueue.push(async () => ({ data: null }));
    rolesReadQueue.push(async () => ({ data: [] }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('profile-status').textContent).toBe('missing'));
    expect(screen.getByTestId('error-text').textContent).toBe('—');
  });

  it('surfaces a failed profile read as profileError, not a silent null', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    profileReadQueue.push(async () => ({ error: { message: 'JWT expired', code: 'PGRST301' } }));
    rolesReadQueue.push(async () => ({ data: [] }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('profile-status').textContent).toBe('error'));
    expect(screen.getByTestId('error-text').textContent).toBe('JWT expired');
  });

  it('does not show active when the pending → active update affects zero rows', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    profileReadQueue.push(async () => ({ data: baseProfile({ account_status: 'pending' }) }));
    rolesReadQueue.push(async () => ({ data: [] }));
    // The activation update returns zero rows (RLS filtered it out, for example).
    profileUpdateQueue.push(async () => ({ data: [] }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'));
    // The profile is still known from the read, but its status must NOT flip to active.
    expect(screen.getByTestId('profile-status').textContent).toBe('has-profile');
    expect(screen.getByTestId('account-status').textContent).toBe('pending');
  });

  it('does show active when the pending → active update actually writes', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: USER_ID } } },
      error: null,
    });
    profileReadQueue.push(async () => ({ data: baseProfile({ account_status: 'pending' }) }));
    rolesReadQueue.push(async () => ({ data: [] }));
    profileUpdateQueue.push(async () => ({ data: [{ id: PROFILE_ID }] }));

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('account-status').textContent).toBe('active'));
    expect(screen.getByTestId('profile-status').textContent).toBe('has-profile');
  });
});
