import { describe, expect, it } from 'vitest';
import {
  boundaryBounds, carryIntoNextDay, deleteChange, incompleteEntries, isTiled,
  moveBoundary, segmentAt, statusAtMidnight, tapStatus, tile, totalMinutes,
} from '@/lib/eld/tapLog';
import { MINUTES_PER_DAY } from '@/lib/eld/rodsGridGeometry';
import type { DraftSegment } from '@/hooks/useRodsDay';

const HERE = { city: 'Pleasant Hill', state: 'MO' };
const THERE = { city: 'Joplin', state: 'MO' };

function day(): DraftSegment[] {
  let d = tapStatus([], 0, 1, HERE);          // off duty from midnight
  d = tapStatus(d, 6 * 60, 4, HERE);          // 06:00 on duty
  d = tapStatus(d, 7 * 60, 3, HERE);          // 07:00 driving
  return d;
}

describe('tap-to-change tiling', () => {
  it('opens an empty day at midnight regardless of the tap time', () => {
    const d = tapStatus([], 9 * 60, 3, HERE);
    expect(d).toHaveLength(1);
    expect(d[0].start_minute).toBe(0);
    expect(d[0].end_minute).toBe(MINUTES_PER_DAY);
  });

  it('always totals 1440 with no gaps', () => {
    const d = day();
    expect(isTiled(d)).toBe(true);
    expect(totalMinutes(d)).toBe(MINUTES_PER_DAY);
  });

  it('a later tap on the same minute replaces the earlier one', () => {
    let d = tapStatus([], 0, 1, HERE);
    d = tapStatus(d, 600, 3, HERE);
    d = tapStatus(d, 600, 4, THERE);
    expect(d.filter((s) => s.start_minute === 600)).toHaveLength(1);
    expect(segmentAt(d, 700)?.duty_status).toBe(4);
    expect(totalMinutes(d)).toBe(MINUTES_PER_DAY);
  });
});

describe('the forgotten tap', () => {
  it('moves a boundary back and still totals 1440', () => {
    const d = day();
    const late = d.find((s) => s.start_minute === 7 * 60)!;
    const fixed = moveBoundary(d, late.localId, 6 * 60 + 20);
    expect(segmentAt(fixed, 6 * 60 + 30)?.duty_status).toBe(3);
    expect(totalMinutes(fixed)).toBe(MINUTES_PER_DAY);
    expect(isTiled(fixed)).toBe(true);
  });

  it('cannot move a boundary across its neighbours', () => {
    const d = day();
    const mid = d.find((s) => s.start_minute === 6 * 60)!;
    const bounds = boundaryBounds(d, mid.localId)!;
    expect(bounds).toEqual({ min: 1, max: 7 * 60 - 1 });
    expect(moveBoundary(d, mid.localId, 23 * 60).find((s) => s.duty_status === 4)!.start_minute)
      .toBe(7 * 60 - 1);
  });

  it('the first change of the day cannot be moved off midnight', () => {
    const d = day();
    const first = d[0];
    expect(moveBoundary(d, first.localId, 300)[0].start_minute).toBe(0);
  });

  it('inserts a missed change between two blocks and splits the driving', () => {
    let d = tapStatus([], 0, 3, HERE);
    d = tapStatus(d, 11 * 60, 4, THERE);
    d = tapStatus(d, 12 * 60, 3, THERE);
    expect(segmentAt(d, 11 * 60 + 30)?.duty_status).toBe(4);
    expect(segmentAt(d, 13 * 60)?.duty_status).toBe(3);
    expect(totalMinutes(d)).toBe(MINUTES_PER_DAY);
  });

  it('deletes a change and extends the earlier status over it', () => {
    const d = day();
    const target = d.find((s) => s.start_minute === 6 * 60)!;
    const fixed = deleteChange(d, target.localId);
    expect(segmentAt(fixed, 6 * 60 + 30)?.duty_status).toBe(1);
    expect(totalMinutes(fixed)).toBe(MINUTES_PER_DAY);
    expect(isTiled(fixed)).toBe(true);
  });

  it('deleting the first change promotes the next one to midnight', () => {
    const d = day();
    const fixed = deleteChange(d, d[0].localId);
    expect(fixed[0].start_minute).toBe(0);
    expect(fixed[0].duty_status).toBe(4);
    expect(totalMinutes(fixed)).toBe(MINUTES_PER_DAY);
  });
});

describe('midnight split', () => {
  it('carries the running status into the next day at 00:00', () => {
    const yesterday = day();
    const today = carryIntoNextDay(yesterday);
    expect(today).toHaveLength(1);
    expect(today[0].start_minute).toBe(0);
    expect(today[0].duty_status).toBe(statusAtMidnight(yesterday)!.duty_status);
    expect(today[0].remarks).toBe('');
    expect(totalMinutes(today)).toBe(MINUTES_PER_DAY);
  });

  it('carries nothing from an empty day', () => {
    expect(carryIntoNextDay([])).toEqual([]);
  });
});

describe('completeness', () => {
  it('reports an entry missing its town', () => {
    const d = tapStatus([], 0, 1, { city: '', state: '' });
    expect(incompleteEntries(d)).toHaveLength(1);
    expect(incompleteEntries(day())).toHaveLength(0);
  });

  it('tile() drops a collapsed entry', () => {
    const base = day();
    const collapsed = tile([...base, { ...base[0], localId: 'x', start_minute: 0 }]);
    expect(collapsed.every((s) => (s.end_minute ?? 0) > s.start_minute)).toBe(true);
  });
});
