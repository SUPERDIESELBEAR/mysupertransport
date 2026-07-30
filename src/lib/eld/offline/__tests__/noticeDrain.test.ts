/**
 * §7 notice-queue migration.
 *
 * The branches these tests pin apart are the ones that look alike in code and
 * behave very differently: a query error (transient) versus a missing row
 * (possibly orphaned), and a delivered notice (bytes safe in Storage) versus
 * a sent-but-never-uploaded notice (bytes exist only on this phone).
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { id: string; notice_sent_at: string | null; notice_uploaded_at: string | null };

const server: { row: Row | null; error: { message: string } | null } = { row: null, error: null };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        eq: self,
        maybeSingle: () => Promise.resolve({ data: server.row, error: server.error }),
      });
      return chain;
    },
    functions: { invoke: () => Promise.resolve({ error: null }) },
  },
}));

const alerts: { kind: string; detail: string }[] = [];
vi.mock('../queue/alerts', () => ({
  raiseSyncAlert: (input: { kind: string; detail: string }) => {
    alerts.push(input);
    return Promise.resolve();
  },
}));

const { roadsideDb } = await import('../db');
const { allEntries } = await import('../queue/store');
const { drainPendingNotices, noticeSyncId, noticeSignatureKey } =
  await import('../queue/noticeDrain');

const EVENT = '11111111-2222-3333-4444-555555555555';
const OPERATOR = '99999999-8888-7777-6666-555555555555';
const KEY = `eld_pending_notice_${EVENT}`;
const STATE_KEY = `eld_notice_drain_state_${EVENT}`;
const PDF_B64 = btoa('%PDF-1.4 fake');
const SIG_B64 = btoa('fake-png-bytes');

function savePending(opts: { signature?: boolean } = {}) {
  localStorage.setItem(KEY, JSON.stringify({
    eventId: EVENT,
    operatorId: OPERATOR,
    pdfBase64: PDF_B64,
    signatureBase64: opts.signature === false ? null : SIG_B64,
    savedAt: '2026-07-01T10:00:00.000Z',
  }));
}

function kinds(entries: { kind: string }[]): string[] {
  return entries.map((e) => e.kind).sort();
}

beforeEach(async () => {
  localStorage.clear();
  alerts.length = 0;
  server.row = null;
  server.error = null;
  await roadsideDb.sync_queue.clear();
  await roadsideDb.notice_pdfs.clear();
  await roadsideDb.signature_images.clear();
});

describe('branch 1a — delivered and stored', () => {
  it('enqueues nothing and removes both the pending key and its state key', async () => {
    savePending();
    localStorage.setItem(STATE_KEY, JSON.stringify({ deferrals: 3, first_deferred_at: null, alerted_missing: true }));
    server.row = { id: EVENT, notice_sent_at: 'x', notice_uploaded_at: 'y' };

    const summary = await drainPendingNotices();

    expect(summary.alreadyDelivered).toBe(1);
    expect(await allEntries()).toHaveLength(0);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });
});

describe('branch 1b — sent but never uploaded', () => {
  it('uploads the bytes without re-sending, and keeps the signature exempt from pruning', async () => {
    savePending();
    server.row = { id: EVENT, notice_sent_at: 'x', notice_uploaded_at: null };

    const summary = await drainPendingNotices();

    expect(summary.uploadOnly).toBe(1);
    const entries = await allEntries();
    expect(kinds(entries)).toEqual(['upload_notice_pdf', 'upload_notice_signature']);
    expect(kinds(entries)).not.toContain('send_notice');

    const sig = await roadsideDb.signature_images.get(noticeSignatureKey(EVENT));
    expect(sig?.origin).toBe('local_pending_upload');
    expect(sig?.uploaded).toBe(false);
    expect(await roadsideDb.notice_pdfs.get(EVENT)).toBeTruthy();

    // Released only after every enqueued row read back.
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('branch 2 — unsent notice migrates fully', () => {
  it('enqueues upload + signature + dependent send with deterministic ids, once', async () => {
    savePending();
    server.row = { id: EVENT, notice_sent_at: null, notice_uploaded_at: null };

    const summary = await drainPendingNotices();
    expect(summary.migrated).toBe(1);

    const entries = await allEntries();
    expect(kinds(entries)).toEqual(['send_notice', 'upload_notice_pdf', 'upload_notice_signature']);

    const pdfId = await noticeSyncId(EVENT, 'upload_notice_pdf');
    const sigId = await noticeSyncId(EVENT, 'upload_notice_signature');
    const sendId = await noticeSyncId(EVENT, 'send_notice');
    expect(entries.map((e) => e.id).sort()).toEqual([pdfId, sigId, sendId].sort());
    expect(pdfId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const send = entries.find((e) => e.kind === 'send_notice')!;
    expect(send.depends_on.sort()).toEqual([pdfId, sigId].sort());

    expect(localStorage.getItem(KEY)).toBeNull();

    // Re-running with the key restored must not double-enqueue.
    savePending();
    await drainPendingNotices();
    expect(await allEntries()).toHaveLength(3);
  });
});

describe('branch 3 — query error is transient', () => {
  it('retains the key, enqueues nothing, and does not count toward the orphan alert', async () => {
    savePending();
    server.error = { message: 'Failed to fetch' };

    const summary = await drainPendingNotices();

    expect(summary.deferredOffline).toBe(1);
    expect(summary.deferredMissing).toBe(0);
    expect(await allEntries()).toHaveLength(0);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(alerts).toHaveLength(0);
  });
});

describe('branch 4 — event row missing', () => {
  it('alerts exactly once on the fifth deferral', async () => {
    savePending();
    server.row = null;

    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await drainPendingNotices();
      expect(alerts).toHaveLength(0);
    }
    await drainPendingNotices();
    expect(alerts.map((a) => a.kind)).toEqual(['notice_orphaned']);

    await drainPendingNotices();
    expect(alerts).toHaveLength(1);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it('alerts on the 7-day arm even when the deferral count is low', async () => {
    savePending();
    server.row = null;

    await drainPendingNotices();
    await drainPendingNotices();
    expect(alerts).toHaveLength(0);

    const state = JSON.parse(localStorage.getItem(STATE_KEY)!);
    expect(state.deferrals).toBe(2);
    state.first_deferred_at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(STATE_KEY, JSON.stringify(state));

    await drainPendingNotices();
    expect(alerts.map((a) => a.kind)).toEqual(['notice_orphaned']);

    await drainPendingNotices();
    expect(alerts).toHaveLength(1);
  });
});

describe('branch 5 — corrupt entries', () => {
  it('leaves a corrupt entry in place and alerts once', async () => {
    localStorage.setItem(KEY, '{not json');

    await drainPendingNotices();
    expect(alerts.map((a) => a.kind)).toEqual(['notice_drain_corrupt']);
    expect(localStorage.getItem(KEY)).toBe('{not json');
    expect(localStorage.getItem(`eld_notice_drain_corrupt_${KEY}`)).not.toBeNull();

    await drainPendingNotices();
    expect(alerts).toHaveLength(1);
  });

  it('raises one alert per distinct corrupt entry in a single pass', async () => {
    const keyA = 'eld_pending_notice_aaaa';
    const keyB = 'eld_pending_notice_bbbb';
    localStorage.setItem(keyA, '{not json');
    // Parseable JSON, but no eventId — so no event-keyed flag is available.
    localStorage.setItem(keyB, JSON.stringify({ operatorId: OPERATOR, pdfBase64: PDF_B64 }));

    const summary = await drainPendingNotices();

    expect(summary.corrupt).toBe(2);
    expect(alerts).toHaveLength(2);
    expect(alerts.every((a) => a.kind === 'notice_drain_corrupt')).toBe(true);
    expect(alerts[0].detail).toContain(keyA);
    expect(alerts[1].detail).toContain(keyB);

    expect(localStorage.getItem(keyA)).not.toBeNull();
    expect(localStorage.getItem(keyB)).not.toBeNull();
    expect(localStorage.getItem(`eld_notice_drain_corrupt_${keyA}`)).not.toBeNull();
    expect(localStorage.getItem(`eld_notice_drain_corrupt_${keyB}`)).not.toBeNull();
    expect(localStorage.getItem('eld_notice_drain_state_undefined')).toBeNull();

    expect(await allEntries()).toHaveLength(0);
  });
});
