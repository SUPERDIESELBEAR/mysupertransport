/**
 * The hole this closes: RLS filters a certified rods_days/rods_events row
 * before the lock trigger can raise, so PostgREST answers 0 rows and NO error.
 * A client that only inspects `error` reports success and the driver's edits
 * vanish silently.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  assertRowsAffected, assertDeleteApplied, isRowNotWritable, RowNotWritableError,
  ROW_NOT_WRITABLE_MESSAGE,
} from '@/lib/eld/rodsWrite';
import { classifyError } from '../queue/classify';
import { REJECTION_SQLSTATES, conditionGroupFor } from '../queue/types';

const FILTERED = { data: [], error: null };

describe('zero rows affected', () => {
  it('throws RowNotWritableError when a write returns no rows and no error', () => {
    expect(() => assertRowsAffected(FILTERED, {
      table: 'rods_days', operation: 'header update', dayId: 'd1', logDate: '2026-07-30',
    })).toThrow(RowNotWritableError);
  });

  it('accepts a write that returned at least one row', () => {
    expect(() => assertRowsAffected({ data: [{ id: 'd1' }], error: null }, {
      table: 'rods_days', operation: 'header update',
    })).not.toThrow();
  });

  it('still surfaces a genuine server error unchanged', () => {
    expect(() => assertRowsAffected({ data: null, error: { message: 'boom' } }, {
      table: 'rods_events', operation: 'segment insert',
    })).toThrow('boom');
  });

  it('treats a delete as filtered only when rows survive it', () => {
    expect(() => assertDeleteApplied(0, { dayId: 'd1' })).not.toThrow();
    expect(() => assertDeleteApplied(3, { dayId: 'd1' })).toThrow(RowNotWritableError);
  });

  it('shows the driver the certified-elsewhere copy, not the internal detail', () => {
    try {
      assertRowsAffected(FILTERED, {
        table: 'rods_events', operation: 'segment insert', dayId: 'd1', logDate: '2026-07-30',
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isRowNotWritable(err)).toBe(true);
      expect((err as Error).message).toBe(ROW_NOT_WRITABLE_MESSAGE);
      expect((err as RowNotWritableError).detail).toContain('affected 0 rows');
      expect((err as RowNotWritableError).detail).toContain('2026-07-30');
    }
  });

  it('classifies as row_not_writable, never as success or a retryable class', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = new RowNotWritableError({ table: 'rods_days', operation: 'header update' });
    const { klass, message } = classifyError(err);
    expect(klass).toBe('row_not_writable');
    expect(message).toBe(ROW_NOT_WRITABLE_MESSAGE);
  });
});

describe('SQLSTATE scheme', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('carries every re-keyed code, and never P0001', () => {
    for (const code of [
      'P0042', 'P0043', 'P0044', 'P0050', 'P0051',
      'P0070', 'P0071', 'P0072', 'P0080', 'P0081', 'P0082', 'P0083', 'P0084',
    ]) {
      expect(REJECTION_SQLSTATES[code], code).toBeTruthy();
    }
    expect(REJECTION_SQLSTATES.P0001).toBeUndefined();
  });

  it('never shares a code between two functions', () => {
    // certify_rods_day owns P0010..P0031 exclusively; discard/create have their
    // own ranges. A duplicate here would make the runner unable to tell which
    // operation refused.
    const codes = Object.keys(REJECTION_SQLSTATES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(conditionGroupFor('P0012')).toBe('not_owner');
    expect(conditionGroupFor('P0071')).toBe('not_owner');
    expect(conditionGroupFor('P0081')).toBe('not_owner');
  });
});