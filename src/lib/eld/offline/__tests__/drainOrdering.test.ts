/**
 * Pass B §9, sync criteria 1 and 2, EXERCISED rather than read.
 *
 * Ordering and the certify-last rule were believed correct from reading
 * `dueEntries` and `drainQueue`. Nothing had ever drained a queue that held a
 * full dependent chain — two byte uploads plus the certification that depends
 * on both — alongside an unrelated exempt entry. This does that against a real
 * Dexie store (fake-indexeddb), with only the network leaves mocked, and
 * records the ACTUAL execution order.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls: string[] = [];

/** Every handler records its kind. Uploads resolve slowly so a runner that
 *  fired them concurrently would interleave visibly in `calls`. */
function handler(kind: string, delayMs = 0) {
  return vi.fn(async (_payload?: unknown) => {
    calls.push(`${kind}:start`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    calls.push(`${kind}:done`);
  });
}

const upload_rods_pdf = handler('upload_rods_pdf', 20);
const upload_signature = handler('upload_signature', 20);
const certify_rods_day = handler('certify_rods_day');
const raise_sync_alert = handler('raise_sync_alert');
const save_draft_day = handler('save_draft_day');

vi.mock('../queue/handlers', () => ({
  HANDLERS: {
    upload_rods_pdf: (p: never) => upload_rods_pdf(p),
    upload_signature: (p: never) => upload_signature(p),
    certify_rods_day: (p: never) => certify_rods_day(p),
    raise_sync_alert: (p: never) => raise_sync_alert(p),
    save_draft_day: (p: never) => save_draft_day(p),
  },
}));
vi.mock('../queue/noticeDrain', () => ({ drainPendingNotices: async () => {} }));
vi.mock('../queue/alerts', () => ({
  raiseSyncAlert: async () => {},
  recordAlertDeliveryFailure: () => {},
}));
vi.mock('../cache', () => ({ markDayStalled: async () => {} }));
vi.mock('@/lib/eld/rodsWrite', () => ({ isRowNotWritable: () => false }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { roadsideDb } from '../db';
import { enqueue, allEntries } from '../queue/store';
import { drainQueue } from '../queue/runner';

const OP = '33333333-3333-4333-8333-333333333333';

beforeEach(async () => {
  calls.length = 0;
  vi.clearAllMocks();
  await roadsideDb.sync_queue.clear();
});

describe('sync queue drain — real store, dependent chain', () => {
  it('runs the chain in the order the driver performed it and certifies last', async () => {
    // Enqueued out of order on purpose: the certification is committed FIRST,
    // with the earliest-looking id, so anything sorting by insertion or id
    // rather than by client_timestamp + depends_on would run it too early.
    await enqueue({
      id: 'a-certify', kind: 'certify_rods_day',
      payload: { operator_id: OP, log_date: '2026-03-04' },
      depends_on: ['b-pdf', 'c-sig'],
      client_timestamp: '2026-03-04T18:00:03.000Z',
    });
    await enqueue({
      id: 'b-pdf', kind: 'upload_rods_pdf',
      payload: { operator_id: OP, log_date: '2026-03-04' },
      client_timestamp: '2026-03-04T18:00:02.000Z',
    });
    await enqueue({
      id: 'c-sig', kind: 'upload_signature',
      payload: { operator_id: OP, log_date: '2026-03-04' },
      client_timestamp: '2026-03-04T18:00:01.000Z',
    });
    await enqueue({
      id: 'd-draft', kind: 'save_draft_day',
      payload: { operator_id: OP, log_date: '2026-03-04' },
      client_timestamp: '2026-03-04T17:59:00.000Z',
    });

    await drainQueue({ force: true });

    // Observed order, not believed order.
    expect(calls).toEqual([
      'save_draft_day:start', 'save_draft_day:done',
      'upload_signature:start', 'upload_signature:done',
      'upload_rods_pdf:start', 'upload_rods_pdf:done',
      'certify_rods_day:start', 'certify_rods_day:done',
    ]);

    // One at a time: no upload's start appears between another's start and done.
    const starts = calls.filter((c) => c.endsWith(':start'));
    starts.forEach((s, i) => {
      expect(calls[calls.indexOf(s) + 1]).toBe(`${s.slice(0, -6)}:done`);
      expect(i).toBeLessThan(starts.length);
    });

    const done = await allEntries();
    expect(done.every((e) => e.status === 'succeeded' || e.status === 'pending')).toBe(true);
  });

  it('never reaches certify_rods_day when an upload it depends on is rejected', async () => {
    upload_rods_pdf.mockImplementationOnce(async () => {
      calls.push('upload_rods_pdf:start');
      // A named class-P0 refusal, i.e. the server saying no permanently.
      // (A raw 23505 is deliberately classed `server` and retried instead —
      // confirmed in classify.ts, and that path leaves the dependent pending
      // with backoff rather than cancelling it, which is correct.)
      throw Object.assign(new Error('P0019: log must carry a source document'), { code: 'P0019' });
    });

    await enqueue({
      id: 'pdf', kind: 'upload_rods_pdf',
      payload: { operator_id: OP, log_date: '2026-03-05' },
      client_timestamp: '2026-03-05T18:00:01.000Z',
    });
    await enqueue({
      id: 'cert', kind: 'certify_rods_day',
      payload: { operator_id: OP, log_date: '2026-03-05' },
      depends_on: ['pdf'],
      client_timestamp: '2026-03-05T18:00:02.000Z',
    });

    await drainQueue({ force: true });

    expect(certify_rods_day).not.toHaveBeenCalled();
    const cert = (await allEntries()).find((e) => e.id === 'cert');
    // The dependent must not sit pending forever — resolveBlocked cancels it.
    expect(cert?.status).toBe('cancelled');
  });
});
