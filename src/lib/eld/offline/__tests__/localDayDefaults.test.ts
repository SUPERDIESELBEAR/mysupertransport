/**
 * The client-minted draft and the server-defaulted row must be the same log.
 *
 * These two tests guard the phantom-diff class of bug: a field the client
 * omits and the database fills in reads as a difference on every certification
 * preflight after a round-trip, in a field the driver never touched. A dialog
 * that always lists something teaches the driver to skim it, and the action he
 * skims past — "use the saved version" — is a discard.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Dexie from 'dexie';
import { newLocalRodsDay, RODS_PERIOD_START_DEFAULT } from '@/lib/eld/rodsTypes';

/**
 * Columns of public.rods_days that carry a DEFAULT, read from the live schema
 * on 2026-08-01. Every one must be present on a freshly minted local draft
 * with the same value, or a round-trip introduces a diff.
 */
const SERVER_DEFAULTS: Record<string, unknown> = {
  record_source: 'keyed',
  status: 'draft',
  locked: false,
  is_reconstructed: false,
  total_off_duty_minutes: 0,
  total_sleeper_minutes: 0,
  total_driving_minutes: 0,
  total_on_duty_minutes: 0,
  period_start_time: '00:00:00',
};

describe('newLocalRodsDay agrees with the server defaults', () => {
  it('sets every server-defaulted column to the same value', () => {
    const day = newLocalRodsDay({ operator_id: 'op-1', log_date: '2026-08-01' });
    for (const [column, value] of Object.entries(SERVER_DEFAULTS)) {
      expect(
        (day as unknown as Record<string, unknown>)[column],
        `period_start_time-class drift on "${column}"`,
      ).toEqual(value);
    }
  });

  it('keeps the shared constant equal to the database default', () => {
    expect(RODS_PERIOD_START_DEFAULT).toBe(SERVER_DEFAULTS.period_start_time);
  });

  it('applies overrides last so the carrier snapshot wins', () => {
    const day = newLocalRodsDay({
      operator_id: 'op-1',
      log_date: '2026-08-01',
      overrides: { carrier_name: 'SUPERTRANSPORT', period_start_time: '04:00:00' },
    });
    expect(day.carrier_name).toBe('SUPERTRANSPORT');
    expect(day.period_start_time).toBe('04:00:00');
  });
});

describe('Dexie v6 backfill', () => {
  const DB_NAME = 'superdrive_roadside';

  beforeEach(async () => { await Dexie.delete(DB_NAME); });
  afterEach(async () => { await Dexie.delete(DB_NAME); });

  it('fills period_start_time without disturbing unsynced or local_certified_at', async () => {
    // Open at v5 and seed a row exactly as a pre-fix build would have written
    // it: no period_start_time, unsynced, and locally certified.
    const legacy = new Dexie(DB_NAME);
    legacy.version(5).stores({
      local_meta: 'key',
      rods_pdfs: 'log_date, operator_id, uploaded, cached_at',
      rods_documents: 'log_date, operator_id, renderable, cached_at',
      notice_pdfs: 'event_id',
      signature_images: 'key, uploaded, origin',
      roadside_manifest: 'key',
      rods_days_cache: 'log_date, operator_id, unsynced_flag',
      rods_events_cache: 'rods_day_id, log_date',
      pending_mutations: '++id, idempotency_key, next_attempt_at, depends_on',
      sync_queue: 'id, status, next_attempt_at, kind, created_at',
      merged_packets: 'id, event_id, created_at',
      rods_divergences: 'log_date, operator_id, detected_at, acknowledged',
    });
    await legacy.open();
    await legacy.table('rods_days_cache').put({
      log_date: '2026-07-30',
      operator_id: 'op-1',
      unsynced: true,
      unsynced_flag: 1,
      version: 3,
      local_certified_at: '2026-07-30T18:04:00.000Z',
      sync_rejected: false,
      sync_stalled: false,
      cached_at: '2026-07-30T18:04:00.000Z',
      day: { id: 'day-1', operator_id: 'op-1', log_date: '2026-07-30', status: 'certified' },
    });
    legacy.close();

    const { roadsideDb } = await import('../db');
    await roadsideDb.open();
    const row = await roadsideDb.rods_days_cache.get('2026-07-30');

    expect(row?.day.period_start_time).toBe(RODS_PERIOD_START_DEFAULT);
    // The migration modifies ONE field. Everything the device holds about this
    // signed record survives it.
    expect(row?.unsynced).toBe(true);
    expect(row?.local_certified_at).toBe('2026-07-30T18:04:00.000Z');
    expect(row?.version).toBe(3);
    expect(row?.day.id).toBe('day-1');
    roadsideDb.close();
  });
});