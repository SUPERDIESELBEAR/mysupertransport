import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPgFake, PROFILE_ID } from '@/test/helpers/pgFake';
import {
  deriveDeliveredAt,
  isDeliveryInstantMissing,
  STATUSES_PAST_DELIVERY,
} from '@/lib/deliveryInstant';
import { workPeriodForDelivery } from '@/lib/settlementPeriod';

const pg = createPgFake();
vi.mock('@/integrations/supabase/client', () => ({
  get supabase() {
    return pg.client;
  },
}));

/** The writer under test lives in the database; the fake mirrors both triggers. */
const supa = () => pg.client as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
  from: (t: string) => {
    update: (patch: Record<string, unknown>) => {
      eq: (c: string, v: unknown) => Promise<{ error: unknown }>;
    };
  };
};

const load = () => pg.tables.loads.find(l => l.id === 'load-1')!;

function setUpStops(stops: Record<string, unknown>[]) {
  pg.tables.load_stops.length = 0;
  stops.forEach((s, i) =>
    pg.tables.load_stops.push({ id: `stop-${i + 1}`, load_id: 'load-1', ...s }),
  );
}

describe('deriveDeliveredAt (mirror of the database trigger)', () => {
  it('takes the departure from the only delivery stop', () => {
    expect(
      deriveDeliveredAt([
        { stop_type: 'pickup', stop_sequence: 1, actual_departure_at: '2026-08-26T14:00:00Z' },
        { stop_type: 'delivery', stop_sequence: 2, actual_departure_at: '2026-08-27T19:30:00Z' },
      ]),
    ).toBe('2026-08-27T19:30:00Z');
  });

  it('uses the LAST delivery stop when a load has several', () => {
    expect(
      deriveDeliveredAt([
        { stop_type: 'pickup', stop_sequence: 1, actual_departure_at: '2026-08-26T14:00:00Z' },
        { stop_type: 'delivery', stop_sequence: 2, actual_departure_at: '2026-08-27T12:00:00Z' },
        { stop_type: 'delivery', stop_sequence: 3, actual_departure_at: '2026-08-28T09:15:00Z' },
      ]),
    ).toBe('2026-08-28T09:15:00Z');
  });

  it('is null while the final delivery stop has no departure', () => {
    expect(
      deriveDeliveredAt([
        { stop_type: 'delivery', stop_sequence: 2, actual_departure_at: null },
      ]),
    ).toBeNull();
  });
});

describe('missing delivery instant surfacing', () => {
  it('a load at delivered with no instant reads as missing', () => {
    expect(isDeliveryInstantMissing({ status: 'delivered', delivered_at: null })).toBe(true);
  });

  it('every status at delivery or beyond surfaces it', () => {
    STATUSES_PAST_DELIVERY.forEach(status => {
      expect(isDeliveryInstantMissing({ status, delivered_at: null })).toBe(true);
    });
  });

  it('a load still in transit is not missing anything', () => {
    expect(isDeliveryInstantMissing({ status: 'in_transit', delivered_at: null })).toBe(false);
  });

  it('a recorded instant is never missing', () => {
    expect(
      isDeliveryInstantMissing({ status: 'delivered', delivered_at: '2026-08-27T19:30:00Z' }),
    ).toBe(false);
  });
});

describe('the instant reads in carrier time', () => {
  it('11pm Tuesday Pacific lands in the FOLLOWING work week', () => {
    // 2026-09-01 is a Tuesday. 23:00 Pacific = 01:00 Central on Wednesday the
    // 2nd, which opens the next Wed–Tue week.
    const instant = '2026-09-02T06:00:00Z'; // 23:00 PDT Tue / 01:00 CDT Wed
    const period = workPeriodForDelivery(instant, 3);
    expect(period).toEqual({
      periodStart: '2026-09-02',
      periodEnd: '2026-09-08',
      payday: '2026-09-22',
    });
    // The same instant read as Pacific-Tuesday would have fallen in the week
    // that ends 2026-09-01.
    expect(period?.periodStart).not.toBe('2026-08-26');
  });
});

describe('the writer, against the mirrored triggers', () => {
  beforeEach(() => {
    pg.reset();
    setUpStops([
      { stop_sequence: 1, stop_type: 'pickup' },
      { stop_sequence: 2, stop_type: 'delivery' },
    ]);
    load().status = 'in_transit';
  });

  it('recording departure on the final delivery stop derives delivered_at', async () => {
    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T19:30:00Z' })
      .eq('id', 'stop-2');
    expect(load().delivered_at).toBe('2026-08-27T19:30:00Z');
  });

  it('a driver-app departure derives with source stop_departure and the actor', async () => {
    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T19:30:00Z', departure_source: 'driver_app' })
      .eq('id', 'stop-2');
    expect(load().delivered_at_source).toBe('stop_departure');
    expect(load().delivered_at_by).toBe(PROFILE_ID);
  });

  it('a load with several delivery stops uses the LAST one', async () => {
    setUpStops([
      { stop_sequence: 1, stop_type: 'pickup' },
      { stop_sequence: 2, stop_type: 'delivery' },
      { stop_sequence: 3, stop_type: 'delivery' },
    ]);
    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T12:00:00Z' })
      .eq('id', 'stop-2');
    expect(load().delivered_at ?? null).toBeNull();

    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-28T09:15:00Z' })
      .eq('id', 'stop-3');
    expect(load().delivered_at).toBe('2026-08-28T09:15:00Z');
  });

  it('dispatcher entry sets the instant with source dispatcher_entry and the actor', async () => {
    await supa().rpc('set_load_delivered_at', {
      p_load_id: 'load-1',
      p_delivered_at: '2026-08-27T22:00:00Z',
    });
    expect(load().delivered_at).toBe('2026-08-27T22:00:00Z');
    expect(load().delivered_at_source).toBe('dispatcher_entry');
    expect(load().delivered_at_by).toBe(PROFILE_ID);
  });

  it('a stop edit never wipes a dispatcher-entered instant', async () => {
    await supa().rpc('set_load_delivered_at', {
      p_load_id: 'load-1',
      p_delivered_at: '2026-08-27T22:00:00Z',
    });
    await supa().from('load_stops').update({ stop_notes: 'gate 4' }).eq('id', 'stop-2');
    expect(load().delivered_at).toBe('2026-08-27T22:00:00Z');
    expect(load().delivered_at_source).toBe('dispatcher_entry');
  });

  it('correcting a departure updates delivered_at and re-stamps source and actor', async () => {
    await supa().rpc('set_load_delivered_at', {
      p_load_id: 'load-1',
      p_delivered_at: '2026-08-27T22:00:00Z',
    });
    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T19:30:00Z' })
      .eq('id', 'stop-2');
    expect(load().delivered_at).toBe('2026-08-27T19:30:00Z');
    expect(load().delivered_at_source).toBe('stop_departure');

    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T20:45:00Z' })
      .eq('id', 'stop-2');
    expect(load().delivered_at).toBe('2026-08-27T20:45:00Z');
    expect(load().delivered_at_source).toBe('stop_departure');
    expect(load().delivered_at_by).toBe(PROFILE_ID);
  });

  it('clearing the departure clears only what the stop path derived', async () => {
    await supa().from('load_stops')
      .update({ actual_departure_at: '2026-08-27T19:30:00Z' })
      .eq('id', 'stop-2');
    await supa().from('load_stops').update({ actual_departure_at: null }).eq('id', 'stop-2');
    expect(load().delivered_at).toBeNull();
    expect(load().delivered_at_source).toBeNull();
    expect(load().delivered_at_by).toBeNull();
  });

  it('the status transition is not blocked by a missing instant', async () => {
    // Status and the instant are independent facts: marking a load delivered
    // with no departure recorded must succeed and then read as missing.
    const { error } = await supa().from('loads').update({ status: 'delivered' }).eq('id', 'load-1');
    expect(error).toBeNull();
    expect(load().status).toBe('delivered');
    expect(load().delivered_at ?? null).toBeNull();
    expect(isDeliveryInstantMissing(load() as { status: string; delivered_at: string | null })).toBe(true);
  });
});
