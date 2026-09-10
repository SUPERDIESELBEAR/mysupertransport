import { describe, it, expect } from 'vitest';
import {
  milestonesFor,
  validateCadence,
  nextCadenceEvent,
  DEFAULT_PEI_CADENCE,
} from '../peiCadence';

describe('milestonesFor', () => {
  it('produces the historical 5/30 schedule', () => {
    expect(milestonesFor(5, 30)).toEqual([5, 10, 15, 20, 25]);
  });

  it('handles a 7/30 schedule', () => {
    expect(milestonesFor(7, 30)).toEqual([7, 14, 21, 28]);
  });

  it('returns nothing when the GFE day is not after the interval', () => {
    expect(milestonesFor(30, 30)).toEqual([]);
    expect(milestonesFor(31, 30)).toEqual([]);
  });
});

describe('validateCadence', () => {
  it('accepts the defaults', () => {
    expect(validateCadence(5, 30)).toBeNull();
  });
  it('rejects an out-of-range interval', () => {
    expect(validateCadence(0, 30)).toMatch(/Follow up every/);
    expect(validateCadence(16, 30)).toMatch(/Follow up every/);
  });
  it('rejects an out-of-range GFE day', () => {
    expect(validateCadence(5, 6)).toMatch(/Good Faith Effort after/);
    expect(validateCadence(5, 61)).toMatch(/Good Faith Effort after/);
  });
  it('rejects a GFE day at or below the interval', () => {
    expect(validateCadence(10, 10)).toMatch(/later than/);
  });
});

describe('nextCadenceEvent', () => {
  it('names the next reminder', () => {
    expect(nextCadenceEvent(6, DEFAULT_PEI_CADENCE)).toEqual({ day: 10, kind: 'follow_up' });
  });
  it('falls through to the GFE day', () => {
    expect(nextCadenceEvent(26, DEFAULT_PEI_CADENCE)).toEqual({ day: 30, kind: 'gfe' });
  });
  it('returns nothing once the GFE day has passed', () => {
    expect(nextCadenceEvent(30, DEFAULT_PEI_CADENCE)).toBeNull();
  });
  it('returns nothing when automation is switched off', () => {
    expect(nextCadenceEvent(1, { ...DEFAULT_PEI_CADENCE, auto_follow_ups_enabled: false })).toBeNull();
  });
});
