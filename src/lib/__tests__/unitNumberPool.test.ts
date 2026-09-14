import { describe, expect, it } from 'vitest';
import {
  formatPoolOption,
  holderWarning,
  isHardCollision,
  poolKindFor,
  sortPool,
  type UnitHolder,
  type UnitPoolEntry,
} from '../unitNumberPool';

const entry = (unit: number, kind: UnitPoolEntry['kind'], freedAt: string | null = null): UnitPoolEntry =>
  ({ unit, kind, freedAt, note: '' });

const holder = (over: Partial<UnitHolder>): UnitHolder => ({
  operatorId: 'op',
  driverName: 'Driver',
  isActive: true,
  goLiveDate: null,
  deactivatedAt: null,
  state: 'onboarding',
  ...over,
});

describe('sortPool', () => {
  it('offers recycled numbers before gaps, and the next number last', () => {
    const sorted = sortPool([
      entry(272, 'next'),
      entry(199, 'gap'),
      entry(217, 'recycled', '2026-05-01T00:00:00Z'),
    ]);
    expect(sorted.map(e => e.kind)).toEqual(['recycled', 'gap', 'next']);
  });

  it('puts the oldest freed number first, and an unstamped wash-out last', () => {
    const sorted = sortPool([
      entry(253, 'recycled', null),
      entry(241, 'recycled', '2026-07-01T00:00:00Z'),
      entry(217, 'recycled', '2026-04-01T00:00:00Z'),
    ]);
    expect(sorted.map(e => e.unit)).toEqual([217, 241, 253]);
  });

  it('orders gaps numerically', () => {
    const sorted = sortPool([entry(225, 'gap'), entry(190, 'gap'), entry(204, 'gap')]);
    expect(sorted.map(e => e.unit)).toEqual([190, 204, 225]);
  });
});

describe('formatPoolOption', () => {
  it('names when a recycled number was freed', () => {
    expect(formatPoolOption(entry(217, 'recycled', '2026-04-02T12:00:00Z'))).toBe('freed Apr 2, 2026');
    expect(formatPoolOption(entry(231, 'recycled', null))).toBe('freed');
  });

  it('labels gaps and the next number', () => {
    expect(formatPoolOption(entry(199, 'gap'))).toBe('unused');
    expect(formatPoolOption(entry(272, 'next'))).toBe('next available');
  });
});

describe('holderWarning', () => {
  it('says nothing when nobody holds the number', () => {
    expect(holderWarning('272', [])).toBeNull();
  });

  it('names an active holder and blocks nothing silently', () => {
    const w = holderWarning('243', [holder({ driverName: 'Steve Figueroa', state: 'live', goLiveDate: '2026-06-01' })]);
    expect(w).toContain('Steve Figueroa');
    expect(w).toContain('active');
  });

  it('calls an in-onboarding holder reserved', () => {
    expect(holderWarning('247', [holder({ state: 'onboarding' })])).toContain('reserved');
  });

  it('reports a shared number by naming both holders', () => {
    const w = holderWarning('231', [
      holder({ driverName: 'Timothy West', state: 'departed', goLiveDate: '2026-04-28' }),
      holder({ driverName: 'James Deatherage', state: 'released', isActive: false }),
    ]);
    expect(w).toContain('Timothy West');
    expect(w).toContain('James Deatherage');
  });
});

describe('isHardCollision', () => {
  it('is not a collision when the only holder never went live', () => {
    expect(isHardCollision([holder({ state: 'released', isActive: false })])).toBe(false);
  });

  it('is a collision for a live, departed or onboarding holder', () => {
    expect(isHardCollision([holder({ state: 'live' })])).toBe(true);
    expect(isHardCollision([holder({ state: 'departed' })])).toBe(true);
    expect(isHardCollision([holder({ state: 'onboarding' })])).toBe(true);
  });
});

describe('poolKindFor', () => {
  const pool = [entry(217, 'recycled'), entry(199, 'gap'), entry(272, 'next')];

  it('attributes a chosen number to how it was offered', () => {
    expect(poolKindFor('217', pool)).toBe('recycled');
    expect(poolKindFor('199', pool)).toBe('gap');
    expect(poolKindFor('272', pool)).toBe('next');
  });

  it('calls anything off the list manual', () => {
    expect(poolKindFor('163', pool)).toBe('manual');
    expect(poolKindFor('', pool)).toBe('manual');
    expect(poolKindFor('ABC', pool)).toBe('manual');
  });
});
