import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BrokerSelect from '@/components/dispatch/loadForm/BrokerSelect';
import type { Broker } from '@/lib/brokers';
import { brokerFixture } from '@/test/helpers/brokerFixture';


class RO { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

vi.mock('@/components/dispatch/loadForm/BrokerDialog', () => ({
  __esModule: true,
  default: () => null,
}));

const broker: Broker = brokerFixture();


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
