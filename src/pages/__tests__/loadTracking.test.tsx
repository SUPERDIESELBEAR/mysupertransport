import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));

import LoadTrackingPage, { TRACKING_REFRESH_MS } from '@/pages/LoadTrackingPage';

const ok = {
  outcome: 'ok',
  carrier: { legal_name: 'Acme Carrier LLC', mc_number: '111', usdot_number: '222' },
  timezone: 'America/Chicago',
  load_number: 'L-9',
  broker_reference_number: 'BRK-1',
  status_label: 'In transit',
  last_update_at: '2026-09-24T18:00:00Z',
  stops: [
    { sequence: 1, type: 'Pickup', facility_name: 'Grain Co', city: 'Salina', state: 'KS',
      appointment_start: '2026-09-24T15:00:00Z', appointment_end: null,
      arrived_at: '2026-09-24T15:10:00Z', departed_at: '2026-09-24T16:00:00Z' },
    { sequence: 2, type: 'Delivery', facility_name: 'Mill', city: 'Joplin', state: 'MO',
      appointment_start: null, appointment_end: null, arrived_at: null, departed_at: null },
  ],
};

const renderAt = () => render(
  <MemoryRouter initialEntries={['/track/abc']}>
    <Routes><Route path="/track/:token" element={<LoadTrackingPage />} /></Routes>
  </MemoryRouter>,
);

beforeEach(() => rpc.mockReset());
afterEach(() => vi.useRealTimers());

describe('public tracking page', () => {
  it('ok: carrier, status, references, stops, footer; only the resolver is called', async () => {
    rpc.mockResolvedValue({ data: ok, error: null });
    renderAt();
    expect(await screen.findByText('In transit')).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith('resolve_load_tracking_link', { p_token: 'abc' });
    expect(screen.getByText('Load tracking')).toBeInTheDocument();
    expect(screen.getByText('Load L-9')).toBeInTheDocument();
    expect(screen.getByText('Your reference: BRK-1')).toBeInTheDocument();
    expect(screen.getByText('Pickup 1 — Grain Co, Salina, KS')).toBeInTheDocument();
    expect(screen.getByText('Delivery 1 — Mill, Joplin, MO')).toBeInTheDocument();
    expect(screen.getByText(/Arrived: Sep 24, 10:10 AM CDT/)).toBeInTheDocument();
    expect(screen.getAllByText('Arrived: Not yet')).toHaveLength(1);
    expect(screen.getByText('Acme Carrier LLC · MC 111 · USDOT 222')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toMatch(/noindex/);
  });

  it('not active: neutral text with no carrier name', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    renderAt();
    expect(await screen.findByText('This tracking link is not active. Contact the carrier for an update.')).toBeInTheDocument();
    expect(screen.queryByText(/Acme/)).toBeNull();
  });

  it('throttled: neutral text', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'throttled' }, error: null });
    renderAt();
    expect(await screen.findByText('This link has been opened many times in the last hour. Please try again later.')).toBeInTheDocument();
  });

  it('refreshes every 5 minutes, not faster', async () => {
    vi.useFakeTimers();
    rpc.mockResolvedValue({ data: ok, error: null });
    renderAt();
    await act(async () => { await Promise.resolve(); });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(TRACKING_REFRESH_MS).toBe(300_000);
    await act(async () => { vi.advanceTimersByTime(TRACKING_REFRESH_MS - 1000); });
    expect(rpc).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
