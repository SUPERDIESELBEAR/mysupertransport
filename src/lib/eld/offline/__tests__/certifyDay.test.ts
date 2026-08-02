/**
 * The tripwire in `enqueueCertifyDay` guards a path nothing calls yet, which is
 * exactly the shape that rots unnoticed. These tests are the only thing
 * currently exercising it, so they assert the refusals AND that `enqueue` was
 * never reached — a guard that throws after queueing would satisfy a weaker
 * test while losing the whole point.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { PreflightResult } from '@/lib/eld/certifyPreflight';

const enqueue = vi.fn(async (input: { id?: string; kind: string; payload: Record<string, unknown> } = { kind: "?", payload: {} }) => ({
  id: input.id ?? 'generated',
  kind: input.kind,
  payload: input.payload,
}));

vi.mock('../queue/store', () => ({ enqueue: (i: never) => enqueue(i) }));

import { enqueueCertifyDay, type CertifyDayPayload } from '../queue/certifyDay';

const DAY_ID = '11111111-1111-4111-8111-111111111111';
const TOKEN = '22222222-2222-4222-8222-222222222222';

function payload(over: Partial<CertifyDayPayload> = {}): CertifyDayPayload {
  return {
    operator_id: '33333333-3333-4333-8333-333333333333',
    day_id: DAY_ID,
    legal_name: 'Dana Reyes',
    signature_path: `sig/${DAY_ID}.png`,
    pdf_path: `pdf/${DAY_ID}.pdf`,
    device_info: 'iPhone; SUPERDRIVE PWA',
    token: TOKEN,
    changes: [],
    ...over,
  };
}

function preflight(over: Partial<PreflightResult> = {}): PreflightResult {
  return {
    ok: true,
    source: 'local_cache',
    day_id: DAY_ID,
    log_date: '2026-03-04',
    checked_at: '2026-03-04T18:00:00.000Z',
    ...over,
  } as PreflightResult;
}

beforeEach(() => enqueue.mockClear());

describe('enqueueCertifyDay', () => {
  it('refuses a payload with no idempotency token', async () => {
    await expect(enqueueCertifyDay({
      payload: payload({ token: '' }), preflight: preflight(),
    })).rejects.toThrow(/idempotency token/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('refuses a preflight taken against a different log', async () => {
    // The realistic misuse: the preflight left over from the previously open day.
    await expect(enqueueCertifyDay({
      payload: payload(), preflight: preflight({ day_id: '33333333-3333-4333-8333-333333333333' }),
    })).rejects.toThrow(/preflight check of the same log/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('refuses a preflight that is not a clean match', async () => {
    await expect(enqueueCertifyDay({
      payload: payload(), preflight: { ...preflight(), ok: false } as unknown as PreflightResult,
    })).rejects.toThrow(/preflight/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('refuses when no preflight is supplied at all', async () => {
    await expect(enqueueCertifyDay({
      payload: payload(), preflight: undefined as unknown as PreflightResult,
    })).rejects.toThrow(/preflight/i);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('queues once behind a clean preflight, carrying its provenance', async () => {
    const pf = preflight();
    await enqueueCertifyDay({ payload: payload(), preflight: pf });

    expect(enqueue).toHaveBeenCalledTimes(1);
    const arg = enqueue.mock.calls[0][0];
    expect(arg.kind).toBe('certify_rods_day');
    expect(arg.id).toBe(TOKEN);
    expect(arg.payload.day_id).toBe(DAY_ID);
    expect(arg.payload.preflight_source).toBe(pf.source);
    expect(arg.payload.preflight_at).toBe(pf.checked_at);
  });

  it('derives the same entry id from the same token, so a retry cannot double-queue', async () => {
    const first = await enqueueCertifyDay({ payload: payload(), preflight: preflight() });
    const second = await enqueueCertifyDay({ payload: payload(), preflight: preflight() });
    expect(first.id).toBe(second.id);
    expect(first.id).toBe(TOKEN);
  });
});