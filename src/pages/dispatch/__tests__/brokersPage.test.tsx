import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const BROKERS = [
  {
    id: 'broker-1',
    company_name: 'BlueGrace Logistics',
    mc_number: '123456',
    dot_number: null,
    primary_contact_name: 'Jane Doe',
    primary_contact_email: null,
    primary_contact_phone: null,
    billing_email: null,
    address_line1: null,
    address_line2: null,
    city: 'Tampa',
    state: 'FL',
    zip: null,
    factoring_status: 'approved',
    factoring_status_reason: null,
    factoring_status_updated_at: null,
    payment_terms: 'Net 30',
    avg_days_to_pay: 28,
    notes: null,
    is_active: true,
    created_at: '2026-08-01T12:00:00Z',
    updated_at: null,
    loads: [{ count: 40 }],
  },
  {
    id: 'broker-2',
    company_name: 'Orphan Freight',
    mc_number: null,
    dot_number: null,
    primary_contact_name: null,
    primary_contact_email: null,
    primary_contact_phone: null,
    billing_email: null,
    address_line1: null,
    address_line2: null,
    city: null,
    state: null,
    zip: null,
    factoring_status: 'unknown',
    factoring_status_reason: null,
    factoring_status_updated_at: null,
    payment_terms: null,
    avg_days_to_pay: null,
    notes: null,
    is_active: true,
    created_at: '2026-08-20T12:00:00Z',
    updated_at: null,
    loads: [{ count: 0 }],
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (table: string) => {
    const rowsFor = () => (table === 'brokers' ? BROKERS : []);
    const q: Record<string, unknown> = {};
    ['select', 'order', 'in', 'eq', 'update', 'insert', 'delete', 'upsert'].forEach((m) => { q[m] = () => q; });
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: rowsFor(), error: null });
    return q;
  };
  return { supabase: { from: (table: string) => makeQuery(table), rpc: () => Promise.resolve({ data: null, error: null }) } };
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
      isStaff: isManagement || roles.includes('dispatcher') || roles.includes('onboarding_staff'),
      isOperator: roles.includes('operator'),
      isTruckOwner: roles.includes('truck_owner'),
    };
  },
}));

import { useAuth } from '@/hooks/useAuth';
import BrokersListPage from '../BrokersListPage';

/** Mirrors the /dispatch/* guard in App.tsx. */
function DispatchGuard({ children }: { children: React.ReactNode }) {
  const { user, isDispatcher, isManagement, rolesLoaded } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isDispatcher || isManagement) return <>{children}</>;
  if (!rolesLoaded) return <div>loading</div>;
  return <Navigate to="/dashboard" replace />;
}

function renderPage(roles: AppRole[]) {
  authState.roles = roles;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/dispatch/brokers']}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/dashboard" element={<div>dashboard page</div>} />
          <Route path="/dispatch/brokers" element={<DispatchGuard><BrokersListPage /></DispatchGuard>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Brokers page access', () => {
  beforeEach(() => { authState.roles = []; localStorage.clear(); });

  it.each<[AppRole]>([['dispatcher'], ['management'], ['owner']])(
    'renders the broker directory for the %s role',
    async (role) => {
      renderPage([role]);
      expect(await screen.findByRole('heading', { name: 'Brokers' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByText('BlueGrace Logistics').length).toBeGreaterThan(0));
      expect(screen.getAllByText('40').length).toBeGreaterThan(0);
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    },
  );

  it('keeps operators off the brokers page', async () => {
    renderPage(['operator']);
    expect(await screen.findByText('dashboard page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Brokers' })).not.toBeInTheDocument();
  });
});

describe('Brokers page editing', () => {
  beforeEach(() => { authState.roles = []; localStorage.clear(); });

  const openRow = async (name: string) => {
    const cells = await screen.findAllByText(name);
    fireEvent.click(cells[0].closest('tr')!);
    return screen.findByRole('heading', { name: 'Edit broker' });
  };

  it('does not flag the broker being edited as a duplicate of itself', async () => {
    renderPage(['management']);
    await openRow('BlueGrace Logistics');
    await waitFor(() =>
      expect(screen.getByLabelText('Company name *')).toHaveValue('BlueGrace Logistics'));
    expect(screen.queryByText(/possible duplicate broker/i)).not.toBeInTheDocument();
  });

  it('warns when an edit renames a broker into an exact match of another', async () => {
    renderPage(['management']);
    await openRow('Orphan Freight');
    fireEvent.change(screen.getByLabelText('Company name *'), {
      target: { value: 'BlueGrace Logistics' },
    });
    expect(await screen.findByText(/possible duplicate broker/i)).toBeInTheDocument();
  });

  it('offers delete only when the broker has zero loads', async () => {
    renderPage(['management']);
    await openRow('Orphan Freight');
    expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Edit broker' })).not.toBeInTheDocument());

    await openRow('BlueGrace Logistics');
    await waitFor(() =>
      expect(screen.getByLabelText('Company name *')).toHaveValue('BlueGrace Logistics'));
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });

  it('hides delete from dispatchers even on an orphan broker', async () => {
    renderPage(['dispatcher']);
    await openRow('Orphan Freight');
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
  });
});
