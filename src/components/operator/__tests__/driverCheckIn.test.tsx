/**
 * Driver check-in — Module 11 Pass 2.
 *
 * THE TAP IS LATE. He taps once he is stopped, ten to twenty minutes after he
 * actually arrived, and never early. So the adjustments must write the ADJUSTED
 * time, not the moment of the tap, and the write must never be lost to a
 * location fix that did not come.
 *
 * These assert what the CLIENT sends. Provenance (`arrival_source`,
 * `arrival_recorded_by`) is deliberately absent from every patch: the database
 * trigger stamps it from the writer's role, and a client that sent it could
 * overstate it.
 */
process.env.TZ = 'Asia/Karachi';

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

interface Captured { table: string; patch: Record<string, unknown>; id: string }
const updates: Captured[] = [];
let updateError: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ table, patch, id });
          return { error: updateError };
        },
      }),
    }),
  },
}));

import { StopCheckIn, type CheckInStop } from '@/components/operator/StopCheckIn';
import { fromCarrierNaive, minutesAgoIso, toCarrierNaive } from '@/lib/stopCheckIn';

const NOW = new Date('2026-08-28T20:00:00.000Z');

const stop = (over: Partial<CheckInStop> = {}): CheckInStop => ({
  id: 'stop-1',
  stop_sequence: 1,
  stop_type: 'pickup',
  facility_name: 'Cargill Pleasant Hill',
  city: 'Pleasant Hill',
  state: 'MO',
  actual_arrival_at: null,
  actual_departure_at: null,
  ...over,
});

function grantLocation(lat = 38.78, lng = -94.27) {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: lat, longitude: lng } }) },
  });
}

function denyLocation() {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) =>
        fail({ code: 1, message: 'User denied Geolocation' }),
    },
  });
}

beforeEach(() => {
  updates.length = 0;
  updateError = null;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  grantLocation();
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Fake timers advance while the dialog settles, so the written instant is a
 * few milliseconds past NOW. The assertion is on the OFFSET, which is what the
 * feature promises.
 */
function expectMinutesAgo(written: string, minutes: number) {
  const drift = Math.abs(
    new Date(written).getTime() - new Date(minutesAgoIso(minutes, NOW.getTime())).getTime(),
  );
  expect(drift).toBeLessThan(2000);
}

async function tap(action: RegExp, option: RegExp) {
  fireEvent.click(screen.getByRole('button', { name: action }));
  fireEvent.click(await screen.findByRole('button', { name: option }));
}

describe('arrival and departure capture', () => {
  it('records arrival on the driver own stop', async () => {
    render(<StopCheckIn stops={[stop()]} />);
    await tap(/record arrival/i, /^just now$/i);

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].table).toBe('load_stops');
    expect(updates[0].id).toBe('stop-1');
    expectMinutesAgo(updates[0].patch.actual_arrival_at as string, 0);
    expect(updates[0].patch).not.toHaveProperty('actual_departure_at');
  });

  it.each([15, 30, 45])('the %i-minutes-ago adjustment writes the adjusted time, not now', async minutes => {
    render(<StopCheckIn stops={[stop()]} />);
    await tap(/record arrival/i, new RegExp(`^${minutes} minutes ago$`, 'i'));

    await waitFor(() => expect(updates).toHaveLength(1));
    const written = updates[0].patch.actual_arrival_at as string;
    // The tap time is NOT what lands: the adjustment is the whole point.
    expect(NOW.getTime() - new Date(written).getTime()).toBeGreaterThan(minutes * 60_000 - 1000);
    expectMinutesAgo(written, minutes);
  });

  it('writes the timestamp with null coordinates when location is denied', async () => {
    denyLocation();
    render(<StopCheckIn stops={[stop()]} />);
    await tap(/record arrival/i, /^just now$/i);

    await waitFor(() => expect(updates).toHaveLength(1));
    expectMinutesAgo(updates[0].patch.actual_arrival_at as string, 0);
    expect(updates[0].patch).not.toHaveProperty('arrival_latitude');
    expect(updates[0].patch).not.toHaveProperty('arrival_longitude');
  });

  it('carries coordinates when the device offers a fix', async () => {
    render(<StopCheckIn stops={[stop()]} />);
    await tap(/record arrival/i, /^just now$/i);
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].patch.arrival_latitude).toBe(38.78);
    expect(updates[0].patch.arrival_longitude).toBe(-94.27);
  });

  it('records departure with no prior arrival', async () => {
    render(<StopCheckIn stops={[stop()]} />);
    await tap(/record departure/i, /^just now$/i);

    await waitFor(() => expect(updates).toHaveLength(1));
    expectMinutesAgo(updates[0].patch.actual_departure_at as string, 0);
    expect(updates[0].patch).not.toHaveProperty('actual_arrival_at');
  });

  it('surfaces the rejection when the stop belongs to another driver', async () => {
    updateError = { message: 'new row violates row-level security policy for table "load_stops"' };
    const onSaved = vi.fn();
    render(<StopCheckIn stops={[stop({ id: 'someone-elses-stop' })]} onSaved={onSaved} />);
    await tap(/record arrival/i, /^just now$/i);

    expect(await screen.findByRole('alert')).toHaveTextContent(/row-level security/i);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('a correction sends only the timestamp, so the trigger re-stamps source and actor', async () => {
    render(<StopCheckIn stops={[stop({
      actual_arrival_at: '2026-08-28T18:00:00.000Z',
      arrival_source: 'dispatcher_entry',
    })]} />);
    expect(screen.getByText(/entered by dispatch/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /change/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^15 minutes ago$/i }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(Object.keys(updates[0].patch).sort()).toEqual(
      ['actual_arrival_at', 'arrival_latitude', 'arrival_longitude'].sort(),
    );
    expect(updates[0].patch).not.toHaveProperty('arrival_source');
    expect(updates[0].patch).not.toHaveProperty('arrival_recorded_by');
  });

  it('shows a recorded driver check-in with its zone abbreviation', () => {
    render(<StopCheckIn stops={[stop({
      actual_arrival_at: '2026-08-28T18:00:00.000Z',
      arrival_source: 'driver_app',
    })]} />);
    expect(screen.getByText(/driver check-in/i)).toBeTruthy();
    expect(screen.getByText(/CDT/)).toBeTruthy();
  });
});

describe('times round-trip through the carrier helpers under a foreign process TZ', () => {
  it('keeps carrier wall clock regardless of Asia/Karachi', () => {
    expect(process.env.TZ).toBe('Asia/Karachi');
    const naive = '2026-08-28T13:30';
    const iso = fromCarrierNaive(naive);
    expect(iso).toBe('2026-08-28T18:30:00.000Z'); // CDT is UTC-5
    expect(toCarrierNaive(iso)).toBe(naive);
  });
});
