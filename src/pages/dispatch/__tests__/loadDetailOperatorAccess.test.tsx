import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const VISIBLE_LOAD_ID = 'load-own';
/** Stands in for a load owned by a different operator: RLS filters it out, so the
 *  read resolves to null exactly as it does in production. */
const HIDDEN_LOAD_ID = 'load-other';

const LOAD = {
  id: VISIBLE_LOAD_ID,
  load_number: 'ST-TEST-005',
  status: 'dispatched',
  load_type: 'standard',
  equipment_type: 'dry_van',
  rate_type: 'flat',
  linehaul_rate: 1800,
  total_load_value: 2100,
  operator_id: 'op-1',
  internal_notes: 'Broker disputes the detention claim.',
  driver_facing_notes: 'Call dispatch on arrival.',
  special_instructions: 'Dock 14 only.',
  load_stops: [],
};

const CLAIM_FLAGS = [
  {
    id: 'flag-1',
    flag_level: 'hold',
    claim_type: 'damaged_goods',
    description: 'Pallets crushed in transit.',
    reported_at: '2026-08-10T12:00:00Z',
  },
];

const HISTORY_NOTE = 'Driver was unreachable for two hours; dispatch reverted the load.';
const HISTORY = [
  {
    id: 'hist-1',
    previous_status: 'in_transit',
    new_status: 'dispatched',
    changed_at: '2026-08-12T15:30:00Z',
    changed_by: 'profile-1',
    change_source: 'manual_ui',
    notes: HISTORY_NOTE,
  },
];

/** Records every table touched so we can assert operators never read claim_flags. */
const tableCalls: string[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const makeQuery = (table: string) => {
    tableCalls.push(table);
    let requestedId: string | null = null;
    const rowsFor = () => {
      if (table === 'loads') return requestedId === HIDDEN_LOAD_ID ? [] : [LOAD];
      if (table === 'claim_flags') return CLAIM_FLAGS;
      if (table === 'operators') return [{ id: 'op-1', user_id: 'user-1' }];
      if (table === 'load_status_history') return HISTORY;
      if (table === 'profiles') {
        return [{ id: 'profile-1', user_id: 'user-1', first_name: 'Dale', last_name: 'Rivers' }];
      }
      return [];
    };
    const q: Record<string, unknown> = {};
    ['select', 'order', 'in'].forEach((m) => { q[m] = () => q; });
    q.eq = (col: string, value: string) => {
      if (col === 'id' || col === 'load_id') requestedId = value;
      return q;
    };
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
      isStaff: isManagement || roles.includes('dispatcher') || roles.includes('onboarding_staff'),
      isOperator: roles.includes('operator'),
      isTruckOwner: roles.includes('truck_owner'),
    };
  },
}));

import LoadDetailPage from '../LoadDetailPage';

function renderDetail(roles: AppRole[], loadId: string = VISIBLE_LOAD_ID) {
  authState.roles = roles;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/operator/loads']}>
        <LoadDetailPage loadId={loadId} onBack={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const HOLD_BANNER = /this load is on hold and excluded from settlement/i;

describe('Load Detail — operator-facing access', () => {
  beforeEach(() => {
    authState.roles = [];
    tableCalls.length = 0;
  });

  it('hides the hold banner from an operator whose load has an active hold flag', async () => {
    renderDetail(['operator']);
    expect(await screen.findByText('Load Summary')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(HOLD_BANNER)).not.toBeInTheDocument());
    expect(screen.queryByText(/pallets crushed in transit/i)).not.toBeInTheDocument();
  });

  it('shows the hold banner to staff for the same load', async () => {
    renderDetail(['dispatcher']);
    expect(await screen.findByText(HOLD_BANNER)).toBeInTheDocument();
  });

  it('omits Internal Notes for an operator but keeps driver-facing notes', async () => {
    renderDetail(['operator']);
    expect(await screen.findByText('Driver-Facing Notes')).toBeInTheDocument();
    expect(screen.getByText('Special Instructions')).toBeInTheDocument();
    expect(screen.queryByText('Internal Notes')).not.toBeInTheDocument();
    expect(screen.queryByText(/broker disputes the detention claim/i)).not.toBeInTheDocument();
  });

  it('shows all three note blocks to staff', async () => {
    renderDetail(['dispatcher']);
    expect(await screen.findByText('Internal Notes')).toBeInTheDocument();
    expect(screen.getByText('Driver-Facing Notes')).toBeInTheDocument();
    expect(screen.getByText('Special Instructions')).toBeInTheDocument();
  });

  it('never issues a claim_flags read for an operator session', async () => {
    renderDetail(['operator']);
    expect(await screen.findByText('Load Summary')).toBeInTheDocument();
    await waitFor(() => expect(tableCalls).toContain('loads'));
    expect(tableCalls.filter((t) => t === 'claim_flags')).toHaveLength(0);
  });

  it('issues exactly one claim_flags read for a staff session', async () => {
    renderDetail(['dispatcher']);
    expect(await screen.findByText('Load Summary')).toBeInTheDocument();
    await waitFor(() => expect(tableCalls.filter((t) => t === 'claim_flags')).toHaveLength(1));
  });

  it('renders the not-found state when an operator opens another operator\'s load', async () => {
    renderDetail(['operator'], HIDDEN_LOAD_ID);
    expect(await screen.findByText('This load could not be found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /return to loads/i })).toBeInTheDocument();
    expect(screen.queryByText('Load Summary')).not.toBeInTheDocument();
    expect(screen.queryByText('ST-TEST-005')).not.toBeInTheDocument();
  });

  it('shows the driver name to an operator but no assignment controls', async () => {
    renderDetail(['operator']);
    expect(await screen.findByText('Load Summary')).toBeInTheDocument();
    expect(screen.getByText('Driver')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign driver/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reassign$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^unassign$/i })).not.toBeInTheDocument();
  });

  it('shows assignment controls to a dispatcher on the same load', async () => {
    renderDetail(['dispatcher']);
    expect(await screen.findByText('Load Summary')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^reassign$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^unassign$/i })).toBeInTheDocument();
  });
});

describe('Load Detail — status history note visibility', () => {
  beforeEach(() => {
    authState.roles = [];
    tableCalls.length = 0;
  });

  it('renders history entries for an operator but never the note text', async () => {
    const { container } = renderDetail(['operator']);
    expect(await screen.findByText('Status History')).toBeInTheDocument();
    // The entry itself renders (timestamp + changer name resolved).
    await waitFor(() => expect(screen.getByText(/Dale Rivers/)).toBeInTheDocument());
    expect(screen.queryByText(HISTORY_NOTE)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Driver was unreachable');
  });

  it('shows the status history note text to a dispatcher on the same load', async () => {
    renderDetail(['dispatcher']);
    expect(await screen.findByText('Status History')).toBeInTheDocument();
    expect(await screen.findByText(HISTORY_NOTE)).toBeInTheDocument();
  });
});

describe('update_load_status — server-side role gate', () => {
  it('raises for callers without dispatcher/management/owner and pins its ACL', async () => {
    const { resolveMigrationFunctions } = await import('@/test/helpers/migrationFunctions');
    const resolved = resolveMigrationFunctions();
    const fn = Array.from(resolved.values()).find(f => f.name === 'public.update_load_status');
    expect(fn, 'public.update_load_status must exist in the migration set').toBeTruthy();

    const body = fn!.block;
    // Role gate: dispatcher/management/owner only, and it must RAISE, not silently no-op.
    expect(body).toMatch(/has_role\(v_uid, 'management'\)/);
    expect(body).toMatch(/has_role\(v_uid, 'owner'\)/);
    expect(body).toMatch(/has_role\(v_uid, 'dispatcher'\)/);
    expect(body).toMatch(/IF NOT \(v_is_mgmt OR v_is_disp\) THEN\s*\n\s*RAISE EXCEPTION/);
    // Billing statuses are management/owner only.
    expect(body).toMatch(/p_new_status = ANY\(v_billing\) AND NOT v_is_mgmt THEN\s*\n\s*RAISE EXCEPTION/);
    // Note requirement is enforced server-side too.
    expect(body).toMatch(/v_requires_note AND v_note IS NULL THEN\s*\n\s*RAISE EXCEPTION/);
    // Hardened definer.
    expect(fn!.isDefiner).toBe(true);
    expect(fn!.searchPath).toBe('public');
  });
});

describe('assign_load_driver — server-side role and override gates', () => {
  it('raises for non-dispatch roles and restricts overrides to management/owner', async () => {
    const { resolveMigrationFunctions } = await import('@/test/helpers/migrationFunctions');
    const resolved = resolveMigrationFunctions();
    const fn = Array.from(resolved.values()).find(f => f.name === 'public.assign_load_driver');
    expect(fn, 'public.assign_load_driver must exist in the migration set').toBeTruthy();

    const body = fn!.block;
    // Role gate: dispatcher/management/owner only, and it must RAISE for anyone else
    // (an operator-only caller satisfies none of these predicates).
    expect(body).toMatch(/has_role\(v_uid, 'management'\)/);
    expect(body).toMatch(/has_role\(v_uid, 'owner'\)/);
    expect(body).toMatch(/has_role\(v_uid, 'dispatcher'\)/);
    expect(body).toMatch(/IF NOT \(v_is_mgmt OR v_is_disp\) THEN\s*\n\s*RAISE EXCEPTION/);
    // Blocking issues without an override reason are refused outright.
    expect(body).toMatch(/IF v_reason IS NULL THEN\s*\n\s*RAISE EXCEPTION 'Driver is not eligible/);
    // Dispatchers cannot override; management/owner can.
    expect(body).toMatch(/IF NOT v_is_mgmt THEN\s*\n\s*RAISE EXCEPTION 'Management approval is required/);
    expect(fn!.isDefiner).toBe(true);
    expect(fn!.searchPath).toBe('public');
  });
});
