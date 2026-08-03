/**
 * The §8 return leg and its precedence rule.
 *
 * Server → device: a resolution recorded in the office clears the chip on the
 * phone. Device → server: a driver who dismissed offline keeps his dismissal
 * until the queue drains — hydration must never un-acknowledge him, which is
 * the device-local problem §8 exists to solve, inverted.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RodsDay } from '@/lib/eld/rodsTypes';

/** Rows the office holds for this operator, as `rods_divergences` would return. */
const serverDivergences: Array<Record<string, unknown>> = [];

vi.mock('@/integrations/supabase/client', () => {
  const builder = () => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self, eq: self, in: self, order: self, limit: self,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (r: (v: unknown) => unknown) =>
        Promise.resolve({ data: serverDivergences, error: null }).then(r),
    });
    return chain;
  };
  return {
    supabase: {
      from: () => builder(),
      rpc: () => Promise.resolve({ data: null, error: null }),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
      functions: { invoke: () => Promise.resolve({ error: null }) },
    },
  };
});

vi.mock('../queue/alerts', () => ({ raiseSyncAlert: () => Promise.resolve() }));

const { roadsideDb } = await import('../db');
const { reconcileDivergenceAcks } = await import('../hydrate');
const { acknowledgeDivergence, openDivergenceDates } = await import('../divergence');

const OP = 'op-1';
const DATE = '2026-08-06';

function localDay(): RodsDay {
  return {
    id: 'local-1', operator_id: OP, log_date: DATE, record_source: 'keyed',
    status: 'certified', locked: true, is_reconstructed: false,
    supersedes_day_id: null, amendment_reason: null,
    total_off_duty_minutes: 600, total_sleeper_minutes: 0,
    total_driving_minutes: 600, total_on_duty_minutes: 240,
    certified_at: '2026-08-06T20:00:00.000Z',
  } as unknown as RodsDay;
}

async function seedOpenDivergence() {
  await roadsideDb.rods_divergences.put({
    log_date: DATE,
    operator_id: OP,
    local_day: localDay(),
    local_events: [],
    local_row_id: 'local-1',
    server_row_id: 'server-1',
    local_values: { certified_at: '2026-08-06T20:00:00.000Z' },
    server_values: { certified_at: '2026-08-06T21:00:00.000Z' },
    differing_fields: ['certified_at'],
    detected_at: new Date().toISOString(),
    acknowledged: 0,
    acknowledged_source: null,
    acknowledged_by: null,
    acknowledged_reason: null,
    acknowledged_at: null,
  });
}

beforeEach(async () => {
  serverDivergences.length = 0;
  await roadsideDb.rods_divergences.clear();
});

describe('divergence reconciliation', () => {
  it('clears the device chip when the office acknowledged it', async () => {
    await seedOpenDivergence();
    serverDivergences.push({
      id: 'server-div-1', log_date: DATE, acknowledged: true,
      acknowledged_source: 'management', acknowledged_by: 'staff-uuid',
      acknowledged_reason: 'Duplicate write from a replayed queue entry.',
      acknowledged_at: '2026-08-07T10:00:00.000Z',
    });

    expect(await openDivergenceDates()).toContain(DATE);
    const cleared = await reconcileDivergenceAcks(OP);
    expect(cleared).toBe(1);

    const dates = await openDivergenceDates();
    expect(dates.has(DATE)).toBe(false);
    const row = await roadsideDb.rods_divergences.get(DATE);
    expect(row?.acknowledged_source).toBe('management');
    expect(row?.server_id).toBe('server-div-1');
  });

  it('keeps an offline dismissal clear when the server has not heard yet', async () => {
    await seedOpenDivergence();
    // Driver dismisses on the phone with no connectivity: the queue entry is
    // written but has not drained, so the office row is still open.
    await acknowledgeDivergence(DATE, {
      source: 'driver', actor: 'Marcus Mueller', reason: 'Cleared on the device.',
    });
    serverDivergences.push({
      id: 'server-div-1', log_date: DATE, acknowledged: false,
      acknowledged_source: null, acknowledged_by: null,
      acknowledged_reason: null, acknowledged_at: null,
    });

    expect((await openDivergenceDates()).has(DATE)).toBe(false);
    await reconcileDivergenceAcks(OP);

    // The chip stays clear and the driver's own resolution survives untouched.
    const dates = await openDivergenceDates();
    expect(dates.has(DATE)).toBe(false);
    const row = await roadsideDb.rods_divergences.get(DATE);
    expect(row?.acknowledged).toBe(1);
    expect(row?.acknowledged_source).toBe('driver');
    expect(row?.ack_pending).toBe(1);
  });

  it('never reopens a resolved row', async () => {
    await seedOpenDivergence();
    await acknowledgeDivergence(DATE, {
      source: 'driver', actor: 'Marcus Mueller', reason: 'Cleared on the device.',
    });
    // Server row absent entirely — the report has not drained either.
    await reconcileDivergenceAcks(OP);
    const row = await roadsideDb.rods_divergences.get(DATE);
    expect(row?.acknowledged).toBe(1);
  });
});
