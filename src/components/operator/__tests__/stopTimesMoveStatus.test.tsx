/**
 * Alvys M1 pass 2 — driver-side of "a recorded stop time moves the load".
 * The status move itself is the database trigger (0065); these assert the hint
 * line, the delivered toast and the Paperwork-to-finish upload button.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

let loadStatus = 'in_transit';
const { toastSpy } = vi.hoisted(() => ({ toastSpy: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: () => ({ eq: async () => ({ error: null }) }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: loadStatus }, error: null }) }) }),
    }),
  },
}));
vi.mock('@/components/operator/LoadPaperworkUpload', () => ({
  LoadPaperworkUpload: ({ loadId }: { loadId: string }) => <div data-testid="paperwork-upload">{loadId}</div>,
}));
vi.mock('@/components/operator/LoadoutCapture', () => ({
  LoadoutCapture: ({ loadId }: { loadId: string }) => <div data-testid="loadout-capture">{loadId}</div>,
}));

import { StopCheckIn } from '@/components/operator/StopCheckIn';
import { OperatorPaperworkTail } from '@/components/operator/OperatorTodayCard';
import type { HomeLoad } from '@/hooks/useOperatorHome';

const stop = {
  id: 's3', stop_sequence: 3, stop_type: 'delivery', facility_name: null, city: 'Joplin', state: 'MO',
  actual_arrival_at: null, actual_departure_at: null,
};

beforeEach(() => {
  toastSpy.mockClear();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
});

describe('At the facility', () => {
  it('shows the one hint line', () => {
    render(<StopCheckIn stops={[stop]} loadId="L1" loadNumber="ST-1001" />);
    expect(screen.getByText('Record your arrival and departure at every stop. Your times update this load for dispatch.')).toBeInTheDocument();
  });

  it('toasts when the recorded time delivered the load', async () => {
    loadStatus = 'delivered';
    render(<StopCheckIn stops={[stop]} loadId="L1" loadNumber="ST-1001" />);
    fireEvent.click(screen.getByRole('button', { name: /record departure/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Just now' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith({
      title: 'Load ST-1001 is delivered. Upload your paperwork under Paperwork to finish.',
    }));
  });

  it('does not toast delivered when the load did not reach delivered', async () => {
    loadStatus = 'at_delivery';
    render(<StopCheckIn stops={[stop]} loadId="L1" loadNumber="ST-1001" />);
    fireEvent.click(screen.getByRole('button', { name: /record arrival/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Just now' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(toastSpy.mock.calls.some(c => String(c[0]?.title).includes('is delivered'))).toBe(false);
  });
});

describe('Paperwork to finish', () => {
  const base = { id: 'L9', load_number: 'ST-1009', outstandingPaperwork: ['POD'], destinationCity: 'Joplin', destinationState: 'MO' };

  it('offers an Upload paperwork button that opens the same upload control', () => {
    render(<OperatorPaperworkTail loads={[{ ...base, loadType: 'standard' } as unknown as HomeLoad]} />);
    expect(screen.queryByTestId('paperwork-upload')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Upload paperwork' }));
    expect(screen.getByTestId('paperwork-upload')).toHaveTextContent('L9');
  });

  it('uses the loadout capture for loadouts', () => {
    render(<OperatorPaperworkTail loads={[{ ...base, loadType: 'loadout' } as unknown as HomeLoad]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Upload paperwork' }));
    expect(screen.getByTestId('loadout-capture')).toBeInTheDocument();
  });
});
