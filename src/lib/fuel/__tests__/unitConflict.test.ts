import { describe, expect, it } from 'vitest';
import { diagnoseUnitConflict, resolveOperatorUnit } from '../operatorUnit';

/**
 * ONLY A REAL DISAGREEMENT IS A FLAG.
 *
 * One record filled and the other empty is the normal shape for 48 of 60
 * active drivers; flagging it would bury the one case that matters.
 */
describe('diagnoseUnitConflict', () => {
  it('both present and equal: no flag', () => {
    expect(diagnoseUnitConflict({ onboardingUnit: '263', operatorUnit: '263' }).conflict).toBe(false);
    expect(diagnoseUnitConflict({ onboardingUnit: ' 263 ', operatorUnit: '263' }).conflict).toBe(false);
  });

  it('both present and different: flagged, with both values and the one in use', () => {
    const c = diagnoseUnitConflict({ onboardingUnit: '263', operatorUnit: '219' });
    expect(c).toEqual({
      conflict: true,
      onboardingUnit: '263',
      operatorUnit: '219',
      usedUnit: '263',
      usedSource: 'onboarding',
    });
  });

  it('onboarding only: no flag — the normal shape for most drivers', () => {
    const c = diagnoseUnitConflict({ onboardingUnit: '260', operatorUnit: null });
    expect(c.conflict).toBe(false);
    expect(c.usedUnit).toBe('260');
  });

  it('operator only: no flag', () => {
    const c = diagnoseUnitConflict({ onboardingUnit: '   ', operatorUnit: '263' });
    expect(c.conflict).toBe(false);
    expect(c.usedSource).toBe('operator');
  });

  it('neither: no flag, and nothing to use', () => {
    const c = diagnoseUnitConflict({ onboardingUnit: null, operatorUnit: null });
    expect(c.conflict).toBe(false);
    expect(c.usedUnit).toBeNull();
  });
});

describe('the resolved value is unchanged by this pass', () => {
  const drivers = [
    { onboardingUnit: '260', operatorUnit: null, expected: '260' },
    { onboardingUnit: null, operatorUnit: '263', expected: '263' },
    { onboardingUnit: '263', operatorUnit: '219', expected: '263' },
    { onboardingUnit: ' 301 ', operatorUnit: '301', expected: '301' },
    { onboardingUnit: null, operatorUnit: null, expected: null },
  ];

  it('every fuel consumer still gets the same unit as before', () => {
    for (const d of drivers) {
      expect(resolveOperatorUnit(d)).toBe(d.expected);
      expect(diagnoseUnitConflict(d).usedUnit).toBe(d.expected);
    }
  });
});
