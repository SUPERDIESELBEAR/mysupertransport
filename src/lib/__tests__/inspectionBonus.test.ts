import { describe, it, expect } from 'vitest';
import { evaluateBonus, bonusAmountForLevel } from '../inspectionBonus';

const base = {
  stopType: 'dot_inspection',
  outcome: 'clean',
  level: 'level_1' as const,
  violationCount: 0,
  reportNumber: 'MO-2026-0091',
  stopAt: '2026-09-10T08:00:00Z',
  reportSubmittedAt: '2026-09-10T18:00:00Z',
};

describe('bonusAmountForLevel', () => {
  it('pays 100 / 50 / 25 for Levels I, II and III', () => {
    expect(bonusAmountForLevel('level_1')).toBe(100);
    expect(bonusAmountForLevel('level_2')).toBe(50);
    expect(bonusAmountForLevel('level_3')).toBe(25);
  });

  it('pays nothing for other levels', () => {
    expect(bonusAmountForLevel('level_4')).toBe(0);
    expect(bonusAmountForLevel(null)).toBe(0);
  });
});

describe('evaluateBonus', () => {
  it('accepts a clean Level I inspection reported in time', () => {
    const r = evaluateBonus(base);
    expect(r.eligible).toBe(true);
    expect(r.amount).toBe(100);
    expect(r.warnings).toEqual([]);
  });

  it('rejects any recorded violation, out of service or not', () => {
    expect(evaluateBonus({ ...base, violationCount: 1, outcome: 'violations_no_oos' }).eligible).toBe(false);
    expect(evaluateBonus({ ...base, oosVehicle: true, outcome: 'out_of_service' }).eligible).toBe(false);
  });

  it('rejects a traffic stop and levels outside I–III', () => {
    expect(evaluateBonus({ ...base, stopType: 'traffic_stop' }).eligible).toBe(false);
    expect(evaluateBonus({ ...base, level: 'level_5' }).eligible).toBe(false);
  });

  it('warns but stays eligible when the case number is missing', () => {
    const r = evaluateBonus({ ...base, reportNumber: '' });
    expect(r.eligible).toBe(true);
    expect(r.warnings.join(' ')).toContain('case number');
  });

  it('warns when the report lands outside the 24-hour window', () => {
    const r = evaluateBonus({ ...base, reportSubmittedAt: '2026-09-12T08:00:00Z' });
    expect(r.eligible).toBe(true);
    expect(r.warnings.join(' ')).toContain('outside the 24-hour window');
  });

  it('warns when the submission time was never recorded', () => {
    const r = evaluateBonus({ ...base, reportSubmittedAt: null });
    expect(r.warnings.join(' ')).toContain('cannot be confirmed');
  });
});
