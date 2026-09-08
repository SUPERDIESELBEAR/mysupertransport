import { describe, expect, it } from 'vitest';
import {
  diagnoseUnmatched, disagreementMessages, sourceOfDisagreement, unmatchedReasonMessage,
  type CardAssignmentWindow,
} from '../fuelDiagnosis';

/**
 * "Unmatched" is three problems with three different fixes. Each one has to
 * produce its own sentence, and the sentence has to name the assignment window
 * wherever one exists — that is the message that answers the owner's question
 * unaided.
 */

const ali: CardAssignmentWindow = {
  operatorName: 'Ali Mohamed',
  assignedAt: '2026-09-07',
  returnedAt: null,
};

describe('unmatched reasons', () => {
  it('a card that is not in inventory says so', () => {
    const r = diagnoseUnmatched(false, [], '2026-08-29');
    expect(r.kind).toBe('no_such_card');
    expect(unmatchedReasonMessage('224', '2026-08-29', r)).toBe(
      'Card 224 is not in SUPERDRIVE. No fuel card with that number exists in equipment inventory.',
    );
  });

  it('a card in inventory with no assignment at all says so', () => {
    const r = diagnoseUnmatched(true, [], '2026-08-29');
    expect(r.kind).toBe('never_assigned');
    expect(unmatchedReasonMessage('224', '2026-08-29', r)).toBe(
      'Card 224 is in equipment inventory but is not assigned to anyone.',
    );
  });

  it("ALI MOHAMED: assigned, but after the transaction date — the window is named", () => {
    const r = diagnoseUnmatched(true, [ali], '2026-08-29');
    expect(r.kind).toBe('assigned_later');
    expect(unmatchedReasonMessage('224', '2026-08-29', r)).toBe(
      'Card 224 is assigned to Ali Mohamed from 09/07/2026. This transaction is dated '
      + '08/29/2026, before that assignment began.',
    );
  });

  it('a card returned before the transaction date names both ends', () => {
    const r = diagnoseUnmatched(true, [
      { operatorName: 'Dan Pratt', assignedAt: '2026-06-01', returnedAt: '2026-08-15' },
    ], '2026-08-29');
    expect(r.kind).toBe('returned_earlier');
    expect(unmatchedReasonMessage('212', '2026-08-29', r)).toBe(
      'Card 212 was assigned to Dan Pratt from 06/01/2026 until 08/15/2026. '
      + 'This transaction is dated 08/29/2026, after that assignment ended.',
    );
  });

  it('a gap between two holders reports the nearer side', () => {
    const before = { operatorName: 'Dan Pratt', assignedAt: '2026-06-01', returnedAt: '2026-08-27' };
    const r = diagnoseUnmatched(true, [before, ali], '2026-08-29');
    expect(r.kind).toBe('returned_earlier');
  });

  it('an assignment covering the date is never reported as a window miss', () => {
    const r = diagnoseUnmatched(true, [
      { operatorName: 'Ali Mohamed', assignedAt: '2026-08-01', returnedAt: null },
    ], '2026-08-29');
    expect(r.kind).toBe('never_assigned');
  });
});

/**
 * ROBERT FRANCIS. The resolver prefers onboarding_status.unit_number over
 * operators.unit_number, so a stale value in the first shadows a correct one in
 * the second. Naming the source is the point.
 */
describe('disagreements', () => {
  it('names every field that disagreed, both values, and the source of ours', () => {
    const msgs = disagreementMessages(
      [
        { field: 'unit_no', csv_value: '263', system_value: '000' },
        { field: 'driver_name', csv_value: 'Robert Francis', system_value: 'TWEET FLEET' },
      ],
      { onboardingUnit: '000', operatorUnit: '263' },
    );
    expect(msgs).toEqual([
      'Unit: file says 263, SUPERDRIVE says 000 (from onboarding record).',
      'Driver: file says Robert Francis, SUPERDRIVE says TWEET FLEET (from profile).',
    ]);
  });

  it('the unit source is the operator record when the onboarding record is blank', () => {
    expect(sourceOfDisagreement('unit_no', { onboardingUnit: '  ', operatorUnit: '263' }))
      .toBe('operator');
    expect(sourceOfDisagreement('unit_no', null)).toBe('unknown');
    expect(sourceOfDisagreement('driver_name', null)).toBe('profile');
  });
});
