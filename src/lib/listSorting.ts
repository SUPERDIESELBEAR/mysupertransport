/**
 * Shared sorting helpers for list pages (Loads today; settlements, invoices,
 * fuel, drivers and brokers later).
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

/** Cycles a header: asc -> desc -> back to the page default (null). */
export function nextSortState(current: SortState | null, column: string): SortState | null {
  if (!current || current.column !== column) return { column, direction: 'asc' };
  if (current.direction === 'asc') return { column, direction: 'desc' };
  return null;
}

export type SortValue = string | number | null | undefined;

/** Null-safe comparator: nulls always sort last regardless of direction. */
export function compareValues(a: SortValue, b: SortValue, direction: SortDirection): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;

  let result: number;
  if (typeof a === 'number' && typeof b === 'number') result = a - b;
  else result = String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

  return direction === 'asc' ? result : -result;
}

/** Builds a sort value from a fixed enum ordering (e.g. load workflow order). */
export function enumOrderValue(order: readonly string[], value: string | null | undefined): number | null {
  if (!value) return null;
  const index = order.indexOf(value);
  return index === -1 ? null : index;
}
