/**
 * Certified days are immutable at both ends. These tests pin the precedence
 * rule: local-only certifications are untouchable, amendments replace, and a
 * genuine mismatch is flagged rather than smoothed over.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

const serverRows: { events: RodsEvent[]; dayStatus: string | null } = {
  events: [], dayStatus: 'certified',
};

vi.mock('@/integrations/supabase/client', () => {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self, eq: self, not: self, gte: self, lte: self, limit: self,
      order: () => Promise.resolve({ data: serverRows.events, error: null }),
      maybeSingle: () => Promise.resolve({
        data: table === 'rods_days' ? { status: serverRows.dayStatus } : null,
        error: null,
      }),
      then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
    });
    return chain;
  };
  return {
    supabase: {
      from: (t: string) => builder(t),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
      functions: { invoke: () => Promise.resolve({ error: null }) },
    },
  };
});

const alerts: string[] = [];
vi.mock('../queue/alerts', () => ({
  raiseSyncAlert: (input: { kind: string }) => { alerts.push(input.kind); return Promise.resolve(); },
}));

const cached = vi.fn(() => Promise.resolve({ bytes: new ArrayBuffer(1), signatureKey: null }));
vi.mock('../ensureDayCached', () => ({
  ensureDayCached: (...args: unknown[]) => cached(...(args as [])),
  markDayPdfUploaded: () => Promise.resolve(),
}));

const { roadsideDb } = await import('../db');
const { cacheKeyedDay } = await import('../hydrate');
const { compareKeyedDay, acknowledgeDivergence, divergenceHeldDates } = await import('../divergence');

const DATE = '2026-07-30';

function day(id: string): RodsDay {
  return {
    id, operator_id: 'op-1', log_date: DATE, record_source: 'keyed', status: 'certified',
    locked: true, is_reconstructed: false, supersedes_day_id: null, amendment_reason: null,
    total_off_duty_minutes: 600, total_sleeper_minutes: 0, total_driving_minutes: 600,
    total_on_duty_minutes: 240, certified_at: '2026-07-30T20:00:00.000Z',
    updated_at: '2026-07-30T20:00:00.000Z', created_at: '2026-07-30T06:00:00.000Z',
    source_document_path: null, pdf_path: null, certification_legal_name: 'A Driver',
    certification_signature_path: null,
  } as unknown as RodsDay;
}

function withOverrides(id: string, over: Partial<RodsDay>): RodsDay {
  return { ...day(id), ...over };
}

async function seedCache(cachedDay: RodsDay, uploaded: boolean) {
  await roadsideDb.rods_days_cache.put({
    log_date: DATE, operator_id: 'op-1', day: cachedDay, cached_at: '2026-07-30T20:00:01.000Z',
    unsynced: false, version: 0, local_certified_at: null, sync_rejected: false, sync_stalled: false,
  });
  await roadsideDb.rods_events_cache.put({
    rods_day_id: cachedDay.id, log_date: DATE, events: [], cached_at: '2026-07-30T20:00:01.000Z',
    unsynced: false, version: 0,
  });
  await roadsideDb.rods_pdfs.put({
    log_date: DATE, operator_id: 'op-1', bytes: new ArrayBuffer(4), mime: 'application/pdf',
    uploaded, cached_at: '2026-07-30T20:00:01.000Z',
  });
}

beforeEach(async () => {
  await roadsideDb.open();
  await Promise.all([
    roadsideDb.rods_days_cache.clear(), roadsideDb.rods_events_cache.clear(),
    roadsideDb.rods_pdfs.clear(), roadsideDb.rods_divergences.clear(),
  ]);
  serverRows.events = [];
  serverRows.dayStatus = 'certified';
  alerts.length = 0;
  cached.mockClear();
});

describe('cheap comparison', () => {
  it('sees a totals or segment-count difference', () => {
    const a = day('d1');
    const b = withOverrides('d1', { total_driving_minutes: 601 });
    expect(compareKeyedDay(a, [], b, []).differing).toContain('total_driving_minutes');
    expect(compareKeyedDay(a, [], a, [{} as RodsEvent]).differing).toContain('segment_count');
    expect(compareKeyedDay(a, [], a, []).differing).toHaveLength(0);
  });
});

describe('precedence', () => {
  it('never overwrites a certification that has not synced', async () => {
    await seedCache(day('d1'), false);
    await cacheKeyedDay(withOverrides('d1', { total_driving_minutes: 999 }), 'A Driver');
    expect(cached).not.toHaveBeenCalled();
    expect(await roadsideDb.rods_divergences.count()).toBe(0);
  });

  it('refreshes when the synced copy matches', async () => {
    await seedCache(day('d1'), true);
    await cacheKeyedDay(withOverrides('d1', { updated_at: '2026-07-30T23:00:00.000Z' }), 'A Driver');
    expect(cached).toHaveBeenCalled();
    expect(await roadsideDb.rods_divergences.count()).toBe(0);
  });

  it('flags a same-id mismatch instead of overwriting', async () => {
    await seedCache(day('d1'), true);
    await cacheKeyedDay(withOverrides('d1', { certified_at: '2026-07-31T01:00:00.000Z' }), 'A Driver');
    expect(cached).not.toHaveBeenCalled();
    const row = await roadsideDb.rods_divergences.get(DATE);
    expect(row?.differing_fields).toContain('certified_at');
    expect(alerts).toContain('certified_day_divergence');
  });

  it('replaces on an amendment that supersedes the cached row', async () => {
    await seedCache(day('d1'), true);
    await cacheKeyedDay(withOverrides('d2', { supersedes_day_id: 'd1' }), 'A Driver');
    expect(cached).toHaveBeenCalled();
    expect(await roadsideDb.rods_divergences.count()).toBe(0);
  });

  it('cross-device: A replaces its copy with B\'s amendment even when supersedes_day_id is null', async () => {
    await seedCache(day('d1'), true);
    serverRows.dayStatus = 'superseded'; // A's cached row, as the server now sees it
    await cacheKeyedDay(withOverrides('d2', { supersedes_day_id: null }), 'A Driver');
    expect(cached).toHaveBeenCalled();
    expect(await roadsideDb.rods_divergences.count()).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  it('flags a different id with no supersession relationship', async () => {
    await seedCache(day('d1'), true);
    serverRows.dayStatus = 'certified';
    await cacheKeyedDay(withOverrides('d2', { supersedes_day_id: null }), 'A Driver');
    expect(cached).not.toHaveBeenCalled();
    expect((await roadsideDb.rods_divergences.get(DATE))?.server_row_id).toBe('d2');
  });
});

describe('resolution', () => {
  it('holds bytes while open, releases the hold after 30 days, and clears on ack', async () => {
    await seedCache(day('d1'), true);
    await cacheKeyedDay(withOverrides('d1', { total_on_duty_minutes: 1 }), 'A Driver');
    expect(await divergenceHeldDates(new Date('2026-08-05T00:00:00Z'))).toContain(DATE);
    expect(await divergenceHeldDates(new Date('2027-01-01T00:00:00Z'))).not.toContain(DATE);

    await acknowledgeDivergence(DATE, { source: 'driver', actor: 'A Driver', reason: 'contacted' });
    const row = await roadsideDb.rods_divergences.get(DATE);
    expect(row?.acknowledged).toBe(1);
    expect(row?.acknowledged_source).toBe('driver');
    expect(await divergenceHeldDates(new Date('2026-08-05T00:00:00Z'))).not.toContain(DATE);
  });
});