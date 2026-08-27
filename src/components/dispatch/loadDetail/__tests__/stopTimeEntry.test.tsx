/**
 * Stop time capture — the entry control and its provenance line.
 *
 * The database decides the capture source; this file pins what the dispatcher
 * sees and what the control refuses to send. Reversed pairs are rejected rather
 * than swapped, and the control does not exist at all for a role that has no
 * business recording times.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updates: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        updates.push({ table, ...payload });
        return { eq: async () => ({ error: null }) };
      },
      select: () => ({ in: async () => ({ data: [], error: null }) }),
    }),
  },
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

let roles = { isDispatcher: true, isManagement: false };
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => roles }));

import StopTimeEntry from '../StopTimeEntry';

/** Drive the entry popup the way a dispatcher does: open, fill both, Done. */
function pick(label: string, naive: string) {
  const [date, time] = naive.split('T');
  fireEvent.click(screen.getByRole('button', { name: label }));
  fireEvent.change(screen.getByLabelText('Date'), { target: { value: date } });
  fireEvent.change(screen.getByLabelText('Time'), { target: { value: time } });
  fireEvent.click(screen.getByRole('button', { name: `Done ${label.toLowerCase()}` }));
}
import StopsTimeline from '../StopsTimeline';
import { DEPARTURE_BEFORE_ARRIVAL_MESSAGE } from '@/lib/stopTimes';

const baseStop = {
  id: 'stop-1',
  stop_sequence: 1,
  stop_type: 'pickup',
  facility_name: 'Riverbend Grain',
  actual_arrival_at: null,
  actual_departure_at: null,
  arrival_source: null,
  departure_source: null,
  arrival_recorded_by: null,
  departure_recorded_by: null,
} as never;

beforeEach(() => {
  updates.length = 0;
  toast.mockClear();
  roles = { isDispatcher: true, isManagement: false };
});

describe('StopTimeEntry', () => {
  it('rejects a departure earlier than the arrival and sends nothing', async () => {
    render(<StopTimeEntry stopId="stop-1" arrival={null} departure={null} />);

    pick('Record arrival', '2026-08-27T10:00');
    pick('Record departure', '2026-08-27T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(DEPARTURE_BEFORE_ARRIVAL_MESSAGE);
    expect(updates).toHaveLength(0);
  });

  it('clears each field independently back to null', async () => {
    render(
      <StopTimeEntry
        stopId="stop-1"
        arrival="2026-08-27T13:00:00.000Z"
        departure="2026-08-27T15:00:00.000Z"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear departure' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].actual_departure_at).toBeNull();
    expect(updates[0].actual_arrival_at).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear arrival' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));

    await waitFor(() => expect(updates).toHaveLength(2));
    expect(updates[1].actual_arrival_at).toBeNull();
  });

  it('never sends coordinates or a capture source', async () => {
    render(<StopTimeEntry stopId="stop-1" arrival={null} departure={null} />);
    pick('Record arrival', '2026-08-27T10:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save times' }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(Object.keys(updates[0]).sort()).toEqual(
      ['actual_arrival_at', 'actual_departure_at', 'table'],
    );
  });
});

describe('StopsTimeline provenance', () => {
  it('renders "Driver check-in" for a driver_app arrival', async () => {
    render(
      <StopsTimeline
        stops={[{
          ...(baseStop as object),
          actual_arrival_at: '2026-08-27T13:00:00.000Z',
          arrival_source: 'driver_app',
          arrival_recorded_by: 'p-1',
        }] as never}
      />,
    );
    expect(await screen.findByText('Driver check-in')).toBeInTheDocument();
  });

  it('renders "Entered by <name>" for a dispatcher_entry departure', async () => {
    render(
      <StopsTimeline
        stops={[{
          ...(baseStop as object),
          actual_departure_at: '2026-08-27T15:00:00.000Z',
          departure_source: 'dispatcher_entry',
          departure_recorded_by: null,
        }] as never}
      />,
    );
    expect(await screen.findByText('Entered by dispatch')).toBeInTheDocument();
  });

  it('does not render the entry control for a non-dispatch role', () => {
    roles = { isDispatcher: false, isManagement: false };
    render(<StopsTimeline stops={[baseStop] as never} />);
    expect(screen.queryByRole('button', { name: 'Record arrival' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save times' })).toBeNull();
  });
});
