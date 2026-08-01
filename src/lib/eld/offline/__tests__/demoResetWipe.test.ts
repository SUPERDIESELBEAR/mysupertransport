/**
 * The demo wipe drops the day, meta and queue stores. For a real operator that
 * would destroy the only copy of a locally certified day and its unsynced
 * bytes, so the gate is asserted directly rather than inferred from the caller.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { roadsideDb } from '../db';
import { maybeWipeForDemoReset } from '../demoReset';

const OPERATOR = '11111111-1111-1111-1111-111111111111';
const NEWER = '2026-08-01T12:00:00.000Z';
const OLDER = '2026-07-01T12:00:00.000Z';

async function seed(opts: { isDemo: boolean; seenStamp?: string | null; inFlight?: boolean }) {
  await Promise.all([
    roadsideDb.local_meta.clear(),
    roadsideDb.rods_days_cache.clear(),
    roadsideDb.rods_pdfs.clear(),
    roadsideDb.sync_queue.clear(),
  ]);
  await roadsideDb.local_meta.put({
    key: 'identity',
    operator_id: OPERATOR,
    driver_name: 'Test Driver',
    driver_user_id: null,
    truck_number: null,
    carrier_name: '', carrier_usdot: '', carrier_mc: '',
    carrier_main_office_address: '', carrier_home_terminal_address: '',
    carrier_home_terminal_timezone: '', carrier_fmcsa_division_state: '',
    carrier_cached_at: null,
    home_terminal_address: null,
    home_terminal_timezone: 'America/Chicago',
    is_demo: opts.isDemo,
    demo_reset_at: opts.seenStamp ?? null,
    updated_at: OLDER,
  });
  // A locally certified day plus its unsynced PDF: the bytes at risk.
  await roadsideDb.rods_days_cache.put({
    log_date: '2026-07-30',
    operator_id: OPERATOR,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    day: { status: 'certified' } as any,
    unsynced: true,
    unsynced_flag: 1,
    version: 1,
    local_certified_at: OLDER,
    sync_rejected: false,
    sync_stalled: false,
    cached_at: OLDER,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  await roadsideDb.rods_pdfs.put({
    log_date: '2026-07-30',
    operator_id: OPERATOR,
    bytes: new ArrayBuffer(8),
    mime: 'application/pdf',
    uploaded: false,
    cached_at: OLDER,
  });
  if (opts.inFlight) {
    await roadsideDb.sync_queue.put({
      id: 'q1',
      kind: 'certify_rods_day',
      status: 'in_flight',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: { log_date: '2026-07-30' } as any,
      attempts: 1,
      next_attempt_at: OLDER,
      created_at: OLDER,
      updated_at: OLDER,
      last_error: null,
      last_error_class: null,
      depends_on: [],
      coalesce_key: null,
      completed_at: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
}

async function survives() {
  return {
    days: await roadsideDb.rods_days_cache.count(),
    pdfs: await roadsideDb.rods_pdfs.count(),
    queue: await roadsideDb.sync_queue.count(),
  };
}

describe('demo reset wipe gate', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('refuses on a real operator even when the server stamp is newer', async () => {
    await seed({ isDemo: false });
    const outcome = await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: false, demoResetAt: NEWER,
    });
    expect(outcome).toBe('not_demo');
    expect(await survives()).toEqual({ days: 1, pdfs: 1, queue: 0 });
  });

  it('refuses when the operator row could not be read (is_demo unknown)', async () => {
    await seed({ isDemo: true });
    const outcome = await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: undefined, demoResetAt: NEWER,
    });
    expect(outcome).toBe('not_demo');
    expect((await survives()).days).toBe(1);
  });

  it('is a no-op when the stamp has already been honoured', async () => {
    await seed({ isDemo: true, seenStamp: NEWER });
    expect(await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: true, demoResetAt: NEWER,
    })).toBe('already_applied');
    expect((await survives()).days).toBe(1);
  });

  it('defers rather than clearing under an in-flight certification', async () => {
    await seed({ isDemo: true, inFlight: true });
    const outcome = await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: true, demoResetAt: NEWER,
    });
    expect(outcome).toBe('deferred');
    expect(await survives()).toEqual({ days: 1, pdfs: 1, queue: 1 });
  }, 20_000);

  it('wipes a quiesced demo device and records the stamp', async () => {
    await seed({ isDemo: true });
    expect(await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: true, demoResetAt: NEWER,
    })).toBe('wiped');
    expect(await survives()).toEqual({ days: 0, pdfs: 0, queue: 0 });
    const meta = await roadsideDb.local_meta.get('identity');
    expect(meta?.demo_reset_at).toBe(NEWER);
    // Second load must not wipe again.
    expect(await maybeWipeForDemoReset({
      operatorId: OPERATOR, isDemo: true, demoResetAt: NEWER,
    })).toBe('already_applied');
  });
});
