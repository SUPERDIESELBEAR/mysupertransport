import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const LOADS = [
  {
    id: 'load-1',
    load_number: 'ST-1042',
    status: 'dispatched',
    equipment_type: 'dry_van',
    linehaul_rate: 1800,
    total_load_value: 2100,
    created_at: '2026-08-01T12:00:00Z',
    operator_id: 'op-1',
    brokers: { company_name: 'Acme Logistics' },
  },
];

// Minimal PostgREST-shaped stub: builder methods chain, and awaiting the
// builder resolves with the rows for whichever table was requested.
vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (table: string) => {
    const rowsFor = () => {
      if (table === 'loads') return LOADS;
      if (table === 'operators') return [{ id: 'op-1', user_id: 'user-1' }];
      if (table === 'profiles') return [{ user_id: 'user-1', first_name: 'Dale', last_name: 'Rivers' }];
      return [];
    };
    const q: Record<string, unknown> = {};
    ['select', 'order', 'in', 'eq'].forEach((m) => { q[m] = () => q; });
    q.maybeSingle = () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rowsFor(), error: null });
    return q;
  };
  return { supabase: { from: (table: string) => makeQuery(table) } };
});

const authState = { roles: [] as AppRole[] };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => {
    const roles = authState.roles;
    const isOwner = roles.includes('owner');
    const isManagement = roles.includes('management') || isOwner;
    return {
      user: { id: 'user-1' },
      roles,
      rolesLoaded: true,
      isOwner,
      isManagement,
      isDispatcher: roles.includes('dispatcher'),
      isOperator: roles.includes('operator'),
      isTruckOwner: roles.includes('truck_owner'),
    };
  },
}));

import { useAuth } from '@/hooks/useAuth';
import LoadsListPage from '../LoadsListPage';
import LoadDetailPlaceholderPage from '../LoadDetailPlaceholderPage';

/** Mirrors the /dispatch/* guard in App.tsx. */
function DispatchGuard({ children }: { children: React.ReactNode }) {
  const { user, isDispatcher, isManagement, rolesLoaded } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isDispatcher || isManagement) return <>{children}</>;
  if (!rolesLoaded) return <div>loading</div>;
  return <Navigate to="/dashboard" replace />;
}

function renderApp(roles: AppRole[]) {
  authState.roles = roles;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dispatch/loads']}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
          <Route path="/dispatch/loads" element={<DispatchGuard><LoadsListPage /></DispatchGuard>} />
          <Route path="/dispatch/loads/:id" element={<DispatchGuard><LoadDetailPlaceholderPage /></DispatchGuard>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Loads page routing', () => {
  beforeEach(() => { authState.roles = []; });

  it.each<[AppRole]>([['dispatcher'], ['management'], ['owner']])(
    'renders the loads list for the %s role',
    async (role) => {
      renderApp([role]);
      expect(await screen.findByRole('heading', { name: 'Loads' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByText('ST-1042').length).toBeGreaterThan(0));
      expect(screen.getAllByText('Acme Logistics').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Dale Rivers').length).toBeGreaterThan(0);
      expect(screen.queryByText('dashboard page')).not.toBeInTheDocument();
    },
  );

  it('navigates to /dispatch/loads/:id when a row is clicked', async () => {
    renderApp(['dispatcher']);
    const cells = await screen.findAllByText('ST-1042');
    const row = cells[0].closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(row!);
    expect(await screen.findByText('Load detail coming soon.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to loads/i })).toBeInTheDocument();
  });

  it('redirects a role without dispatch access away from the loads page', async () => {
    renderApp(['operator']);
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
  });
});
