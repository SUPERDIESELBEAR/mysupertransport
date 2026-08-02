/**
 * Wire-observed rejections from `enforce_rods_correction_request_update`.
 *
 * A correction request is an append-only compliance record: what was asked,
 * who asked it, and what the driver answered must survive intact. The trigger
 * enforces that; these fixtures pin the SQLSTATEs it raises so a later rewrite
 * of the trigger cannot quietly drop a guarantee without failing here.
 *
 * Every envelope below is the verbatim `PostgrestError` body returned over
 * PostgREST on 2026-08-02, from a real driver session (JWT minted through
 * create-preview-session -> redeem-preview-session -> /auth/v1/verify) against
 * demo operator Marcus Mueller. No code is asserted from reading the function
 * body — that assumption is what produced a wrong attribution before.
 *
 * Correction requests own the P0100 block. They previously reused P0072-P0075,
 * which collided with discard_rods_amendment: `classifyError` routes on the
 * code alone and could not have told a revised response from a discard
 * failure.
 */
import { describe, it, expect } from 'vitest';
import { REJECTION_SQLSTATES, isRejectionSqlState, conditionGroupFor } from '../queue/types';

interface ObservedRejection {
  name: string;
  /** The PATCH body sent over PostgREST. */
  patch: Record<string, unknown>;
  http: number;
  /** Verbatim PostgrestError envelope. */
  error: { code: string; message: string; details: null; hint: null };
}

/** Observed against request 09ee2d9f (declined, response and resolved_at set). */
const OBSERVED: ObservedRejection[] = [
  {
    name: 'driver revises a response already recorded',
    patch: { driver_response: 'Revised: actually I was on duty for part of that period.' },
    http: 500,
    error: {
      code: 'P0106',
      message: 'A correction request response is recorded once and cannot be revised.',
      details: null,
      hint: null,
    },
  },
  {
    name: 'driver back-dates resolved_at',
    patch: { resolved_at: '2026-07-31T00:00:00+00:00' },
    http: 500,
    error: {
      code: 'P0107',
      message: 'The time a correction request was resolved cannot be changed.',
      details: null,
      hint: null,
    },
  },
];

/**
 * The path that must keep working. Observed the same day against request
 * b62132cf: open -> declined with the response as its FIRST write returned
 * HTTP 200 and the representation carried status "declined", the response
 * text, and a server-stamped resolved_at. A second PATCH of driver_response on
 * that now-declined row returned P0106 — so write-once is scoped to revision,
 * not to the decline itself.
 */
const OBSERVED_LEGAL_DECLINE = {
  http: 200,
  status: 'declined',
  driver_response: 'I was off duty at the Harrison AR travel plaza; no work was performed.',
  resolved_at_stamped_by_server: true,
} as const;

describe('enforce_rods_correction_request_update — observed rejections', () => {
  it.each(OBSERVED.map((o) => [o.name, o] as const))('%s', (_name, o) => {
    expect(o.http).toBe(500);
    expect(isRejectionSqlState(o.error.code)).toBe(true);
    expect(REJECTION_SQLSTATES[o.error.code]).toBeTruthy();
    expect(o.error.message.trim()).not.toBe('');
  });

  it('write-once codes are terminal, grouped as an append-only violation', () => {
    for (const o of OBSERVED) {
      expect(conditionGroupFor(o.error.code)).toBe('append_only_record');
    }
  });

  it('the whole P0100 block is registered and unique to this trigger', () => {
    for (const code of [
      'P0100', 'P0101', 'P0102', 'P0103', 'P0104', 'P0105', 'P0106', 'P0107',
    ]) {
      expect(REJECTION_SQLSTATES[code], code).toBeTruthy();
    }
    // P0072 belongs to discard_rods_amendment alone again.
    expect(REJECTION_SQLSTATES.P0072).toBe('not an uncertified correction draft');
    expect(conditionGroupFor('P0072')).toBe('not_a_draft');
  });

  it('the legal decline still passes — write-once is not a decline block', () => {
    expect(OBSERVED_LEGAL_DECLINE.http).toBe(200);
    expect(OBSERVED_LEGAL_DECLINE.status).toBe('declined');
    expect(OBSERVED_LEGAL_DECLINE.driver_response.length).toBeGreaterThan(0);
    expect(OBSERVED_LEGAL_DECLINE.resolved_at_stamped_by_server).toBe(true);
  });
});
