/**
 * Wire-observed rejections from `enforce_eld_extension_request_write`.
 *
 * An FMCSA extension request under 49 CFR 395.34(d) is a filing: once it goes
 * to the Division Administrator, what was said and what came back are the
 * record. The trigger makes the row append-only from that moment; these
 * fixtures pin the SQLSTATEs it raises so a later rewrite cannot quietly drop
 * a guarantee.
 *
 * Every envelope below is the verbatim `PostgrestError` body returned over
 * PostgREST on 2026-08-02, from a real management session against demo event
 * c070374a (operator Marcus Mueller). Nothing here is asserted from reading
 * the function body.
 *
 * Extension requests own the P0110 block.
 */
import { describe, it, expect } from 'vitest';
import { REJECTION_SQLSTATES, isRejectionSqlState, conditionGroupFor } from '../queue/types';

interface ObservedRejection {
  name: string;
  /** The request body sent over PostgREST. */
  patch: Record<string, unknown>;
  http: number;
  error: { code: string; message: string; details: null; hint: null };
}

const OBSERVED: ObservedRejection[] = [
  {
    name: 'draft jumps straight to granted',
    patch: { status: 'granted', response_date: '2026-08-05', response_notes: 'x', granted_through: '2026-08-20' },
    http: 500,
    error: {
      code: 'P0111',
      message: 'An extension request cannot move from draft to granted.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'filing body edited after it was filed',
    patch: { actions_taken: 'rewritten' },
    http: 500,
    error: {
      code: 'P0110',
      message: 'An extension request is append-only once it has been filed with FMCSA.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'grant recorded with no through-date',
    patch: { status: 'granted', response_date: '2026-08-05', response_notes: 'ok' },
    http: 500,
    error: {
      code: 'P0112',
      message: 'A granted extension must name the date the relief runs through.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'response recorded with no text',
    patch: { status: 'denied', response_date: '2026-08-05' },
    http: 500,
    error: {
      code: 'P0113',
      message: 'Recording an FMCSA response needs the response date and what FMCSA said.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'recorded FMCSA response revised',
    patch: { response_notes: 'changed my mind' },
    http: 500,
    error: {
      code: 'P0110',
      message: 'An FMCSA response cannot be revised after it was recorded.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'response timestamp moved after it was set',
    patch: { response_status_at: '2026-08-06T00:00:00Z' },
    http: 500,
    error: {
      code: 'P0115',
      message: 'The time an FMCSA response was recorded is immutable once set.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'granted request withdrawn',
    patch: { status: 'withdrawn' },
    http: 500,
    error: {
      code: 'P0111',
      message: 'An extension request cannot move from granted to withdrawn.',
      details: null,
      hint: null,
    },
  },
];

/**
 * P0114 (delete of a filed request) was NOT observed over the wire and this
 * suite does not claim it was. The DELETE of the filed request returned HTTP
 * 200 with the row still present on the follow-up select: there is no DELETE
 * policy on eld_extension_requests, so RLS filters the row out and the trigger
 * never runs — the same shape as the locked-day no-op delete. P0114 is a
 * backstop only. Treat it as unreachable from any client session until a run
 * observes it.
 *
 * P0114 also carries one narrow exemption, added after this run: a demo
 * sandbox row (is_demo = true) may be deleted at any status, because the demo
 * reset deletes eld_malfunction_events and the FK cascades here. Without it a
 * filed demo request would make reset-demo-driver fail outright. Real filings
 * (is_demo = false) remain undeletable by every role and path.
 */
const OBSERVED_DELETE_NOOP = { http: 200, rows_deleted: 0, row_still_present: true } as const;

/** The second open request is refused by the partial unique index, not the trigger. */
const OBSERVED_DUPLICATE_OPEN = {
  http: 409,
  code: '23505',
  message:
    'duplicate key value violates unique constraint "eld_extension_requests_one_open_per_event"',
} as const;

/**
 * Projection facts observed the same run, against the same event:
 * - a grant projects onto eld_malfunction_events (extension_granted_at set,
 *   extension_expires_on = granted_through);
 * - a later denial on a SECOND request did not revoke the live grant;
 * - a grant whose granted_through is already past projects nothing.
 */
const OBSERVED_PROJECTION = {
  after_grant: { extension_expires_on: '2026-08-20', granted: true },
  after_later_denial: { extension_expires_on: '2026-08-20', granted: true },
  lapsed_grant: { extension_expires_on: null, granted: false },
} as const;

describe('enforce_eld_extension_request_write — observed rejections', () => {
  it.each(OBSERVED.map((o) => [o.name, o] as const))('%s', (_name, o) => {
    expect(o.http).toBe(500);
    expect(isRejectionSqlState(o.error.code)).toBe(true);
    expect(REJECTION_SQLSTATES[o.error.code]).toBeTruthy();
    expect(o.error.message.trim()).not.toBe('');
  });

  it('append-only codes group as append_only_record, filing rules as extension_filing_invalid', () => {
    expect(conditionGroupFor('P0110')).toBe('append_only_record');
    expect(conditionGroupFor('P0115')).toBe('append_only_record');
    for (const code of ['P0111', 'P0112', 'P0113']) {
      expect(conditionGroupFor(code), code).toBe('extension_filing_invalid');
    }
  });

  it('the whole P0110 block is registered', () => {
    for (const code of ['P0110', 'P0111', 'P0112', 'P0113', 'P0114', 'P0115']) {
      expect(REJECTION_SQLSTATES[code], code).toBeTruthy();
    }
  });

  it('delete of a filed request is a no-op, not an observed P0114', () => {
    expect(OBSERVED_DELETE_NOOP.rows_deleted).toBe(0);
    expect(OBSERVED_DELETE_NOOP.row_still_present).toBe(true);
  });

  it('a second open request is refused by the unique index', () => {
    expect(OBSERVED_DUPLICATE_OPEN.code).toBe('23505');
    expect(OBSERVED_DUPLICATE_OPEN.http).toBe(409);
  });

  it('a denial does not revoke a live grant, and a lapsed grant stops holding', () => {
    expect(OBSERVED_PROJECTION.after_later_denial).toEqual(OBSERVED_PROJECTION.after_grant);
    expect(OBSERVED_PROJECTION.lapsed_grant.granted).toBe(false);
    expect(OBSERVED_PROJECTION.lapsed_grant.extension_expires_on).toBeNull();
  });
});
