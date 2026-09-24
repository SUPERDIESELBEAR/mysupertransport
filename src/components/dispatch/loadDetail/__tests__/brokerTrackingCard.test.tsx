import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let tokenRow: { token: string; revoked_at: string | null } | null = null;
let history: { changed_at: string }[] = [];
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc,
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, eq: self, order: self,
        maybeSingle: async () => ({ data: tokenRow, error: null }),
        limit: async () => ({ data: table === 'load_status_history' ? history : [], error: null }),
      });
      return chain;
    },
  },
}));

import BrokerTrackingCard from '@/components/dispatch/loadDetail/BrokerTrackingCard';

const renderCard = (status = 'covered', deliveredAt: string | null = null) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BrokerTrackingCard loadId="L1" status={status} deliveredAt={deliveredAt} />
  </QueryClientProvider>,
);

beforeEach(() => { tokenRow = null; history = []; rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null }); });

describe('Broker tracking card', () => {
  it('no link yet: explainer and Create tracking link', async () => {
    renderCard();
    expect(await screen.findByText('Share this link with the broker. It shows status and stop times — no rates.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create tracking link' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('get_or_create_load_tracking_link', { p_load_id: 'L1' }));
  });

  it('active: full link, Copy link, Stop sharing with confirmation', async () => {
    tokenRow = { token: 'tok-1', revoked_at: null };
    renderCard();
    expect(await screen.findByText(`${window.location.origin}/track/tok-1`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop sharing' }));
    expect(await screen.findByText("The broker's link will stop working. You can create a new one.")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Stop sharing' }).at(-1)!);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('revoke_load_tracking_link', { p_load_id: 'L1' }));
  });

  it('after stopping: Create new link', async () => {
    tokenRow = { token: 'tok-1', revoked_at: '2026-09-24T00:00:00Z' };
    renderCard();
    expect(await screen.findByRole('button', { name: 'Create new link' })).toBeInTheDocument();
  });

  it('cancelled / TONU: tracking off, no buttons', async () => {
    for (const s of ['cancelled', 'tonu']) {
      const { unmount } = renderCard(s);
      expect(await screen.findByText('Tracking is off for cancelled loads.')).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
      unmount();
    }
  });

  it('delivered more than 7 days ago: expired (delivered_at or first delivered history row)', async () => {
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    const { unmount } = renderCard('delivered', old);
    expect(await screen.findByText('This tracking link has expired.')).toBeInTheDocument();
    unmount();
    history = [{ changed_at: old }];
    renderCard('invoiced', null);
    expect(await screen.findByText('This tracking link has expired.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
