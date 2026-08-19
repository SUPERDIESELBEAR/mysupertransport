import { describe, it, expect } from 'vitest';
import { nextSortState, compareValues, enumOrderValue } from '@/lib/listSorting';
import { LOAD_STATUSES } from '@/lib/loadFormat';
import { DEFAULT_LOAD_COLUMNS, LOAD_COLUMNS } from '@/pages/dispatch/loadsColumns';

describe('list sorting', () => {
  it('cycles asc -> desc -> default', () => {
    const a = nextSortState(null, 'broker');
    expect(a).toEqual({ column: 'broker', direction: 'asc' });
    const b = nextSortState(a, 'broker');
    expect(b).toEqual({ column: 'broker', direction: 'desc' });
    expect(nextSortState(b, 'broker')).toBeNull();
  });

  it('starts a new column at ascending', () => {
    expect(nextSortState({ column: 'broker', direction: 'desc' }, 'driver'))
      .toEqual({ column: 'driver', direction: 'asc' });
  });

  it('sorts empty values last in both directions', () => {
    expect(compareValues(null, 'a', 'asc')).toBeGreaterThan(0);
    expect(compareValues(null, 'a', 'desc')).toBeGreaterThan(0);
  });

  it('orders status by workflow position, not alphabetically', () => {
    expect(enumOrderValue(LOAD_STATUSES, 'available')).toBe(0);
    expect(enumOrderValue(LOAD_STATUSES, 'delivered'))
      .toBeGreaterThan(enumOrderValue(LOAD_STATUSES, 'in_transit')!);
  });
});

describe('loads column defaults', () => {
  it('locks load # and status and defaults to the core five extras', () => {
    expect(LOAD_COLUMNS.filter(c => c.locked).map(c => c.key)).toEqual(['load_number', 'status']);
    expect(DEFAULT_LOAD_COLUMNS).toEqual([
      'load_number', 'status', 'broker', 'driver', 'equipment', 'rate', 'created',
    ]);
  });
});
