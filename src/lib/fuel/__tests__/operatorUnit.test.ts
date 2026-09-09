import { describe, expect, it } from 'vitest';
import {
  diagnoseUnitGap, resolveOperatorUnit, resolveOperatorUnitSource,
  unitGapMessage, unitGapOffersFill,
} from '../operatorUnit';

/**
 * THE RESOLVER AND THE TWO-DIRECTION GAP.
 *
 * The resolver's job is to be the SAME answer the database gives, so the tests
 * are written against `public.operator_unit_number`'s behaviour — trim, empty
 * is absent, onboarding first — not against what a reader might prefer.
 */

describe('resolveOperatorUnit', () => {
  it('prefers onboarding, the order fuel_resolve_card already used', () => {
    expect(resolveOperatorUnit({ onboardingUnit: '260', operatorUnit: '263' })).toBe('260');
    expect(resolveOperatorUnitSource({ onboardingUnit: '260', operatorUnit: '263' }))
      .toBe('onboarding');
  });

  it('falls back to the operator record — the case the fill action creates', () => {
    expect(resolveOperatorUnit({ onboardingUnit: null, operatorUnit: '263' })).toBe('263');
    expect(resolveOperatorUnitSource({ onboardingUnit: null, operatorUnit: '263' }))
      .toBe('operator');
  });

  it('treats blank and whitespace as absent, exactly as the SQL helper does', () => {
    expect(resolveOperatorUnit({ onboardingUnit: '   ', operatorUnit: '263' })).toBe('263');
    expect(resolveOperatorUnit({ onboardingUnit: '', operatorUnit: '' })).toBeNull();
    expect(resolveOperatorUnit({ onboardingUnit: ' 260 ', operatorUnit: null })).toBe('260');
    expect(resolveOperatorUnitSource({ onboardingUnit: null, operatorUnit: null })).toBeNull();
  });

  it('Ali Mohamed: onboarding 260, operator empty, so the header is no longer blank', () => {
    expect(resolveOperatorUnit({ onboardingUnit: '260', operatorUnit: null })).toBe('260');
  });

  it('no record at all resolves to null rather than throwing', () => {
    expect(resolveOperatorUnit(null)).toBeNull();
  });
});

describe('diagnoseUnitGap', () => {
  it('file has it and we do not: the gap is OURS and a fill is offered', () => {
    const gap = diagnoseUnitGap('260', null);
    expect(gap).toEqual({ kind: 'ours', fileUnit: '260' });
    expect(unitGapOffersFill(gap)).toBe(true);
    expect(unitGapMessage(gap)).toBe(
      'File says unit 260, SUPERDRIVE has no unit for this driver.',
    );
  });

  it('we have it and the file does not: the gap is THEIRS and no fill is offered', () => {
    const gap = diagnoseUnitGap(null, '263');
    expect(gap).toEqual({ kind: 'theirs', systemUnit: '263' });
    expect(unitGapOffersFill(gap)).toBe(false);
    expect(unitGapMessage(gap)).toBe(
      'SUPERDRIVE says unit 263, the file has no unit. '
      + 'The unit is missing in the MultiService portal, not here. Correcting it there '
      + 'does NOT change an export you have already downloaded — MultiService will not '
      + 'retroactively alter it, so a fresh export is needed for the file to show it.',
    );
  });

  it('neither side has one: no flag, because there is nothing to act on', () => {
    expect(diagnoseUnitGap(null, null)).toEqual({ kind: 'none' });
    expect(diagnoseUnitGap('  ', '')).toEqual({ kind: 'none' });
    expect(unitGapMessage({ kind: 'none' })).toBeNull();
  });

  it('both present is not this check, whether they agree or not', () => {
    // A mismatch is the matcher's disagreement, raised by preview_fuel_import.
    // Reporting it here too would give one problem two different flags.
    expect(diagnoseUnitGap('260', '260')).toEqual({ kind: 'none' });
    expect(diagnoseUnitGap('260', '263')).toEqual({ kind: 'none' });
  });
});
