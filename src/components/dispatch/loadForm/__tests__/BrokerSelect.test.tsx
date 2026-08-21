import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerSelect from '@/components/dispatch/loadForm/BrokerSelect';
import type { Broker } from '@/lib/brokers';

class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

vi.mock('@/components/dispatch/loadForm/BrokerDialog', () => ({
  __esModule: true,
  default: () => null,
}));

const broker: Broker = {
  id: 'b1', company_name: 'BlueGrace Logistics', mc_number: '123456', dot_number: null,
  primary_contact_name: null, primary_contact_email: null, primary_contact_phone: null,
  billing_email: null, address_line1: null, address_line2: null, city: 'Tampa', state: 'FL',
  zip: null, factoring_status: 'approved', factoring_status_reason: null,
  factoring_status_updated_at: null, payment_terms: null, avg_days_to_pay: null, notes: null,
  is_active: true, created_at: null, updated_at: null, load_count: 4,
};

vi.mock('@/hooks/useBrokers', () => ({
  BROKERS_QUERY_KEY: ['brokers', 'directory'],
  useBrokers: () => ({ data: [broker] }),
}));

const auth = { isManagement: false, isDispatcher: true, isOnboardingStaff: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }));

function renderSelect(value: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BrokerSelect value={value} onChange={() => {}} />
    </QueryClientProvider>,
  );
}

describe('BrokerSelect edit affordance', () => {
  it('offers the edit action to a dispatcher when a broker is selected', () => {
    auth.isDispatcher = true;
    renderSelect('b1');
    expect(screen.getByTestId('broker-edit')).toBeInTheDocument();
  });

  it('hides the edit action when no broker is selected', () => {
    auth.isDispatcher = true;
    renderSelect('');
    expect(screen.queryByTestId('broker-edit')).toBeNull();
  });

  it('hides the edit action from roles that cannot write to brokers', () => {
    auth.isDispatcher = false;
    renderSelect('b1');
    expect(screen.queryByTestId('broker-edit')).toBeNull();
  });
});
