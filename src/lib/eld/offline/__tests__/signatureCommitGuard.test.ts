/**
 * commitCertification is the lock-writer, so it is where a missing signature
 * has to be refused: a certified §395.8 record with a blank signature line
 * looks signed and is not. The pixel pass runs once at the caller; this
 * function re-checks by digest, and refuses a result that describes other
 * bytes or that was computed too long ago to describe these ones.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RodsDay } from '@/lib/eld/rodsTypes';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const { roadsideDb } = await import('../db');
const { commitCertification } = await import('../commitCertification');
const { sha256Hex, SIGNATURE_INVALID_MESSAGE } = await import('@/lib/eld/signatureIntegrity');
const { undeliverableAlertCount, resetUndeliverableAlertCount } = await import('../queue/alerts');

const DATE = '2026-07-09';
/** Structurally a PNG and large enough to be a signature; jsdom cannot decode
 *  it, so commitCertification's own re-run lands in structural mode and the
 *  caller's pixel result stands. The real pixel pass is covered in the browser
 *  by case (k2) of scripts/eld-queue-gate.py. */
const SIG = (() => {
  const bytes = new Uint8Array(1200);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  for (let i = 8; i < bytes.length; i += 1) bytes[i] = i % 251;
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `data:image/png;base64,${btoa(bin)}`;
})();

function day(): RodsDay {
  return {
    id: 'day-1', operator_id: 'op-1', log_date: DATE, record_source: 'keyed',
    status: 'draft', locked: false, is_reconstructed: false, supersedes_day_id: null,
    amendment_reason: null, total_off_duty_minutes: 1440, total_sleeper_minutes: 0,
    total_driving_minutes: 0, total_on_duty_minutes: 0,
    certified_at: null, certification_legal_name: null, certification_signature_path: null,
    source_document_path: null, pdf_path: null,
    created_at: '2026-07-09T00:00:00.000Z', updated_at: '2026-07-09T00:00:00.000Z',
  } as unknown as RodsDay;
}

async function validation(over: Record<string, unknown> = {}) {
  return {
    ok: true, mode: 'pixel' as const, ink_pixels: 3000, ink_fraction: 0.05,
    byte_length: 900, digest: await sha256Hex(SIG),
    checked_at: new Date().toISOString(), ...over,
  };
}

function input(sigValidation: unknown) {
  return {
    operatorId: 'op-1', logDate: DATE, day: day(),
    events: [{
      id: 'e1', rods_day_id: 'day-1', start_minute: 0, end_minute: 1440,
      duty_status: 1, city: 'Joplin', state: 'MO', remarks: null, is_short_period: false,
    }] as never,
    legalName: 'A Driver', signatureDataUrl: SIG,
    pdfBytes: new ArrayBuffer(8), signaturePath: 'op-1/x.png', pdfPath: 'op-1/x.pdf',
    deviceInfo: 'test', token: 'tok-1', changes: [],
    signatureValidation: sigValidation as never,
  };
}

async function assertNothingWritten() {
  expect(await roadsideDb.signature_images.count()).toBe(0);
  expect(await roadsideDb.rods_pdfs.count()).toBe(0);
  expect(await roadsideDb.sync_queue.count()).toBe(0);
  const cached = await roadsideDb.rods_days_cache.get(DATE);
  expect(cached?.local_certified_at ?? null).toBeNull();
}

beforeEach(async () => {
  resetUndeliverableAlertCount();
  await roadsideDb.open();
  await Promise.all([
    roadsideDb.rods_days_cache.clear(), roadsideDb.rods_events_cache.clear(),
    roadsideDb.rods_pdfs.clear(), roadsideDb.signature_images.clear(),
    roadsideDb.sync_queue.clear(), roadsideDb.roadside_manifest.clear(),
  ]);
});

describe('commitCertification refuses an unvalidated signature', () => {
  it('throws on a failing result and writes nothing', async () => {
    await expect(commitCertification(input(await validation({ ok: false, reason: 'blank_or_near_blank' }))))
      .rejects.toThrow(SIGNATURE_INVALID_MESSAGE);
    await assertNothingWritten();
  });

  it('throws on a result describing DIFFERENT bytes', async () => {
    const stolen = await validation({ digest: await sha256Hex('some other signature') });
    await expect(commitCertification(input(stolen))).rejects.toThrow(SIGNATURE_INVALID_MESSAGE);
    await assertNothingWritten();
  });

  it('throws on a stale result', async () => {
    const old = await validation({
      checked_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    await expect(commitCertification(input(old))).rejects.toThrow(SIGNATURE_INVALID_MESSAGE);
    await assertNothingWritten();
  });

  it('throws on a missing result rather than certifying unchecked', async () => {
    await expect(commitCertification(input(undefined))).rejects.toThrow(SIGNATURE_INVALID_MESSAGE);
    await assertNothingWritten();
  });
});

describe('commitCertification accepts a bound result', () => {
  it('commits, and raises no structural alert in pixel mode', async () => {
    const res = await commitCertification(input(await validation()));
    expect(res.localCertifiedAt).toBeTruthy();
    const cached = await roadsideDb.rods_days_cache.get(DATE);
    expect(cached?.local_certified_at).toBe(res.localCertifiedAt);
    // The validation rides on the row and in the queue payload.
    expect((cached?.day as unknown as Record<string, unknown>).certification_signature_validation)
      .toMatchObject({ mode: 'pixel' });
    const certify = (await roadsideDb.sync_queue.toArray())
      .find((e) => e.kind === 'certify_rods_day');
    expect(certify?.payload.signature_validation).toMatchObject({ mode: 'pixel' });
    const alerts = (await roadsideDb.sync_queue.toArray())
      .filter((e) => e.kind === 'raise_sync_alert');
    expect(alerts).toHaveLength(0);
    expect(undeliverableAlertCount()).toBe(0);
  });

  it('raises the structural alert exactly once, AFTER the transaction', async () => {
    await commitCertification(input(await validation({ mode: 'structural', reason: 'no_image_decoder' })));
    const alerts = (await roadsideDb.sync_queue.toArray())
      .filter((e) => e.kind === 'raise_sync_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload.alert_kind).toBe('signature_validated_structurally_only');
    // The day still committed: structural is weaker evidence, not a refusal.
    expect((await roadsideDb.rods_days_cache.get(DATE))?.local_certified_at).toBeTruthy();
  });
});
