import { describe, it, expect } from 'vitest';
import { calcTotalLoadValue } from '../loadRateMath';

describe('calcTotalLoadValue', () => {
  const base = { loadType: 'standard' as const, rateType: 'flat' as const, linehaulRate: '1000' };

  it('adds assigned stop-off charges to the total', () => {
    expect(calcTotalLoadValue({ ...base, stopoffCharges: ['', '50', ''] })).toBe(1050);
  });

  it('sums multiple stop-off charges alongside unbundled FSC', () => {
    expect(calcTotalLoadValue({
      ...base, fscBundled: false, fscAmount: '120', stopoffCharges: ['50', '75'],
    })).toBe(1245);
  });

  it('ignores stop-off charges on loadout loads', () => {
    expect(calcTotalLoadValue({
      ...base, loadType: 'loadout', relocationFee: '600', stopoffCharges: ['50'],
    })).toBe(600);
  });

  it('is unchanged when no stop-off charges are set', () => {
    expect(calcTotalLoadValue({ ...base, stopoffCharges: ['', ''] })).toBe(1000);
  });
});
