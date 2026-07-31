/**
 * Pruning must never remove the only copy of something, and must not let the
 * downloaded-copy stores grow without bound.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { roadsideDb, type RoadsideManifest } from '../db';
import { pruneRoadsideCache, signatureKeyForDay } from '../prune';
import type { RodsDay, RodsEvent } from '@/lib/eld/rodsTypes';

const NOW = new Date('2026-07-30T12:00:00.000Z');
const OLD = '2026-07-01T12:00:00.000Z'; // ~29 days back — past the 14-day cutoff
const KEPT_DATE = '2026-07-30';
const STALE_DATE = '2026-06-20';

const manifest: RoadsideManifest = {
  key: 'current',
  operator_id: 'op-1',
  days: [{
    log_date: KEPT_DATE, kind: 'keyed', label: 'Certified',
    cached: true, renderable: true, filename: null, showsTotals: true,
  }],
  window_start: KEPT_DATE,
  window_end: KEPT_DATE,
  event: null,
  built_at: OLD,
};

function dayRow(log_date: string, id: string) {
  return {
    log_date,
    operator_id: 'op-1',
    day: { id, log_date, operator_id: 'op-1' } as unknown as RodsDay,
    cached_at: OLD,
  };
}

beforeEach(async () => {
  await roadsideDb.open();
  await Promise.all([
    roadsideDb.rods_days_cache.clear(),
    roadsideDb.rods_events_cache.clear(),
    roadsideDb.signature_images.clear(),
    roadsideDb.rods_pdfs.clear(),
  ]);
});

describe('pruneRoadsideCache', () => {
  it('keeps a local_pending_upload signature past the cutoff, removes a downloaded_cache one', async () => {
    await roadsideDb.signature_images.bulkPut([
      { key: 'pending:op-1:2026-06-01', data_url: 'data:image/png;base64,AA', uploaded: false, origin: 'local_pending_upload', cached_at: OLD },
      { key: signatureKeyForDay('op-1', STALE_DATE), data_url: 'data:image/png;base64,BB', uploaded: true, origin: 'downloaded_cache', cached_at: OLD },
    ]);

    await pruneRoadsideCache(manifest, NOW);

    expect(await roadsideDb.signature_images.get('pending:op-1:2026-06-01')).toBeTruthy();
    expect(await roadsideDb.signature_images.get(signatureKeyForDay('op-1', STALE_DATE))).toBeUndefined();
  });

  it('keeps a downloaded signature the manifest still references', async () => {
    const key = signatureKeyForDay('op-1', KEPT_DATE);
    await roadsideDb.signature_images.put({
      key, data_url: 'data:image/png;base64,CC', uploaded: true, origin: 'downloaded_cache', cached_at: OLD,
    });
    await pruneRoadsideCache(manifest, NOW);
    expect(await roadsideDb.signature_images.get(key)).toBeTruthy();
  });

  it('removes both structured rows for an unreferenced stale day and keeps referenced ones', async () => {
    await roadsideDb.rods_days_cache.bulkPut([dayRow(STALE_DATE, 'stale-day'), dayRow(KEPT_DATE, 'kept-day')]);
    await roadsideDb.rods_events_cache.bulkPut([
      { rods_day_id: 'stale-day', log_date: STALE_DATE, events: [] as RodsEvent[], cached_at: OLD, unsynced: false, version: 0 },
      { rods_day_id: 'kept-day', log_date: KEPT_DATE, events: [] as RodsEvent[], cached_at: OLD, unsynced: false, version: 0 },
    ]);

    await pruneRoadsideCache(manifest, NOW);

    expect(await roadsideDb.rods_days_cache.get(STALE_DATE)).toBeUndefined();
    expect(await roadsideDb.rods_events_cache.get('stale-day')).toBeUndefined();
    expect(await roadsideDb.rods_days_cache.get(KEPT_DATE)).toBeTruthy();
    expect(await roadsideDb.rods_events_cache.get('kept-day')).toBeTruthy();
  });

  it('removes an orphaned stale events row', async () => {
    await roadsideDb.rods_events_cache.put({
      rods_day_id: 'orphan', log_date: STALE_DATE, events: [] as RodsEvent[], cached_at: OLD,
      unsynced: false, version: 0,
    });
    await pruneRoadsideCache(manifest, NOW);
    expect(await roadsideDb.rods_events_cache.get('orphan')).toBeUndefined();
  });

  it('never prunes a rods_pdf that has not been uploaded', async () => {
    await roadsideDb.rods_pdfs.put({
      log_date: STALE_DATE, operator_id: 'op-1', bytes: new ArrayBuffer(4),
      mime: 'application/pdf', uploaded: false, cached_at: OLD,
    });
    await pruneRoadsideCache(manifest, NOW);
    expect(await roadsideDb.rods_pdfs.get(STALE_DATE)).toBeTruthy();
  });
});