import { describe, it, expect } from 'vitest';
import {
  inspectionGroup, isAssignedMonth, nextCycleOnOrAfter, nextCycleAfter,
  firstCycleForNewContractor, qualifiesForLaunchCredit, cycleStatus,
  daysUntilDeadline, monthEnd, isDispatchBlocked, cycleLabel,
} from '../inspectionProgram';

describe('inspectionGroup', () => {
  it('puts odd-ending units in Group A', () => {
    expect(inspectionGroup('101')).toBe('A');
    expect(inspectionGroup('7')).toBe('A');
    expect(inspectionGroup('T-2039')).toBe('A');
  });

  it('puts even-ending units in Group B, and treats 0 as even', () => {
    expect(inspectionGroup('102')).toBe('B');
    expect(inspectionGroup('220')).toBe('B');
    expect(inspectionGroup('8')).toBe('B');
  });

  it('refuses to guess with no digits', () => {
    expect(inspectionGroup('')).toBeNull();
    expect(inspectionGroup(null)).toBeNull();
    expect(inspectionGroup('SPARE')).toBeNull();
  });
});

describe('assigned months', () => {
  it('Group A is Oct/Jan/Apr/Jul and Group B is Dec/Mar/Jun/Sep', () => {
    expect([1, 4, 7, 10].every(m => isAssignedMonth('A', m))).toBe(true);
    expect([3, 6, 9, 12].every(m => isAssignedMonth('B', m))).toBe(true);
  });

  it('leaves the makeup months unscheduled for both groups', () => {
    for (const m of [2, 5, 8, 11]) {
      expect(isAssignedMonth('A', m)).toBe(false);
      expect(isAssignedMonth('B', m)).toBe(false);
    }
  });

  it('finds the next cycle on or after a date', () => {
    expect(nextCycleOnOrAfter('A', new Date(2026, 9, 5))).toEqual({ year: 2026, month: 10 });
    expect(nextCycleOnOrAfter('A', new Date(2026, 10, 5))).toEqual({ year: 2027, month: 1 });
    expect(nextCycleAfter('A', new Date(2026, 9, 5))).toEqual({ year: 2027, month: 1 });
    expect(nextCycleOnOrAfter('B', new Date(2026, 9, 5))).toEqual({ year: 2026, month: 12 });
  });
});

describe('credits', () => {
  it('credits a Group A unit inspected on or after Aug 1 2026', () => {
    expect(qualifiesForLaunchCredit('A', '2026-08-26')).toBe(true);
    expect(qualifiesForLaunchCredit('A', '2026-07-31')).toBe(false);
    expect(qualifiesForLaunchCredit('B', '2026-09-01')).toBe(false);
    expect(qualifiesForLaunchCredit('A', null)).toBe(false);
  });

  it('joins a new contractor at least 60 days after onboarding', () => {
    // Onboarded Sep 1 2026 → eligible Oct 31 → first Group A cycle is January.
    expect(firstCycleForNewContractor('A', new Date(2026, 8, 1))).toEqual({ year: 2027, month: 1 });
    // Onboarded Jan 1 2027, Group B → eligible Mar 2 → June.
    expect(firstCycleForNewContractor('B', new Date(2027, 0, 1))).toEqual({ year: 2027, month: 6 });
  });
});

describe('cycleStatus', () => {
  const cycle = { year: 2026, month: 10 };

  it('is upcoming before the month starts', () => {
    expect(cycleStatus({ cycle, now: new Date(2026, 8, 15) })).toBe('upcoming');
  });

  it('is due during the assigned month', () => {
    expect(cycleStatus({ cycle, now: new Date(2026, 9, 15) })).toBe('due');
  });

  it('is overdue once the month ends with nothing submitted', () => {
    expect(cycleStatus({ cycle, now: new Date(2026, 10, 1) })).toBe('overdue');
  });

  it('is grace inside an approved extension, then overdue past it', () => {
    expect(cycleStatus({ cycle, graceUntil: '2026-11-15', now: new Date(2026, 10, 10) })).toBe('grace');
    expect(cycleStatus({ cycle, graceUntil: '2026-11-15', now: new Date(2026, 10, 20) })).toBe('overdue');
  });

  it('closes on submission when no defects were found', () => {
    expect(cycleStatus({ cycle, submittedAt: '2026-10-20T00:00:00Z', now: new Date(2026, 9, 21) })).toBe('closed');
  });

  it('stays open while defects are identified but not repaired', () => {
    expect(cycleStatus({
      cycle, submittedAt: '2026-10-20T00:00:00Z', defectsIdentified: true, now: new Date(2026, 9, 21),
    })).toBe('submitted');
    expect(cycleStatus({
      cycle, submittedAt: '2026-10-20T00:00:00Z', defectsIdentified: true, defectsRepaired: true, now: new Date(2026, 9, 21),
    })).toBe('closed');
  });
});

describe('deadlines', () => {
  it('counts days to month end, and to the grace date when granted', () => {
    expect(monthEnd({ year: 2026, month: 10 }).getDate()).toBe(31);
    expect(daysUntilDeadline({ year: 2026, month: 10 }, null, new Date(2026, 9, 21))).toBe(10);
    expect(daysUntilDeadline({ year: 2026, month: 10 }, '2026-11-15', new Date(2026, 9, 21))).toBe(25);
    expect(daysUntilDeadline({ year: 2026, month: 10 }, null, new Date(2026, 10, 5))).toBe(-5);
  });

  it('only an overdue cycle flags the unit', () => {
    expect(isDispatchBlocked('overdue')).toBe(true);
    expect(isDispatchBlocked('grace')).toBe(false);
    expect(isDispatchBlocked('due')).toBe(false);
  });

  it('labels a cycle in plain words', () => {
    expect(cycleLabel({ year: 2026, month: 10 })).toBe('October 2026');
  });
});
