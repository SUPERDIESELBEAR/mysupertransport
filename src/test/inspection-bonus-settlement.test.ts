import { describe, it, expect } from 'vitest';
import { computeSettlement } from '@/lib/settlementEngine';

const base: any = {
  operatorId: 'op-1',
  periodAnchorDate: '2026-09-05',
  settings: {
    minimum_net_pay_threshold: 0, hold_buffer: 0, equipment_value_per_driver: 0,
    rm_deposit_target: 2000, rm_weekly_deduction: 200, work_week_start_dow: 3,
  },
  companyPolicy: null,
  loads: [],
  equipmentOutstanding: false,
};

describe('Clean Roadside bonus settlement lines', () => {
  it('pays 100% of the approved amount, never through the policy map', () => {
    const c = computeSettlement({
      ...base,
      bonuses: [{ id: 'pay-1', amount: 100, description: 'Clean Level I inspection bonus' }],
    });
    const line = c.lines.find((l) => l.sourceTable === 'inspection_program_payments');
    expect(line).toBeDefined();
    expect(line!.amount).toBe(100);
    expect(line!.lineType).toBe('adjustment');
    expect(line!.sourceId).toBe('pay-1');
    expect(c.grossAmount).toBe(100);
    expect(c.netAmount).toBe(100);
  });

  it('uses a default description when none is given', () => {
    const c = computeSettlement({
      ...base,
      bonuses: [{ id: 'pay-2', amount: 50 }],
    });
    const line = c.lines.find((l) => l.sourceId === 'pay-2');
    expect(line!.description).toBe('Clean inspection bonus');
  });

  it('skips zero amounts', () => {
    const c = computeSettlement({
      ...base,
      bonuses: [{ id: 'pay-3', amount: 0 }],
    });
    expect(c.lines.filter((l) => l.sourceTable === 'inspection_program_payments')).toHaveLength(0);
  });

  it('omits the section entirely when no bonuses are passed', () => {
    const c = computeSettlement(base);
    expect(c.lines.some((l) => l.sourceTable === 'inspection_program_payments')).toBe(false);
  });
});
