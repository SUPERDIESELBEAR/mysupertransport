/**
 * Zero rows affected is an OUTCOME, not a success.
 *
 * The rods_days UPDATE/DELETE policies and every rods_events policy gate on
 * the parent day's `locked = false`. Once a day is certified — on this device
 * or on another one — RLS filters the row out BEFORE enforce_rods_day_lock or
 * enforce_rods_event_lock can raise. PostgREST answers 0 rows and no error, so
 * a client that only inspects `error` believes it committed. The driver's
 * edits then disappear with a green toast behind them.
 *
 * Every write to rods_days / rods_events therefore asks for its rows back and
 * routes an empty result here. This module imports neither Supabase nor React:
 * the sync queue, the hooks and the editor all share it.
 */
import { roadsideDb } from './offline/db';

/** Copy shown to the driver whenever a write was filtered by the lock. */
export const ROW_NOT_WRITABLE_MESSAGE =
  'This log was certified on another device and can no longer be edited.';

export class RowNotWritableError extends Error {
  readonly table: 'rods_days' | 'rods_events';
  readonly dayId: string | null;
  readonly logDate: string | null;

  constructor(input: {
    table: 'rods_days' | 'rods_events';
    dayId?: string | null;
    logDate?: string | null;
    operation: string;
  }) {
    super(ROW_NOT_WRITABLE_MESSAGE);
    this.name = 'RowNotWritableError';
    this.table = input.table;
    this.dayId = input.dayId ?? null;
    this.logDate = input.logDate ?? null;
    // Kept off `message` so the driver never reads it, but present for the
    // Management alert and the queue's last_error detail.
    this.detail = `${input.operation} on ${input.table} affected 0 rows`
      + `${input.dayId ? ` (day ${input.dayId})` : ''}`
      + `${input.logDate ? ` for ${input.logDate}` : ''}.`;
  }

  detail: string;
}

export function isRowNotWritable(err: unknown): err is RowNotWritableError {
  return err instanceof RowNotWritableError
    || (!!err && typeof err === 'object' && (err as { name?: string }).name === 'RowNotWritableError');
}

interface WriteResult {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Assert a write touched at least one row.
 *
 * Callers MUST have asked for the rows back (`.select('id')`); without it
 * PostgREST returns no representation and `data` is null, which is
 * indistinguishable from a filtered write.
 */
export function assertRowsAffected(
  result: WriteResult,
  context: {
    table: 'rods_days' | 'rods_events';
    operation: string;
    dayId?: string | null;
    logDate?: string | null;
  },
): void {
  if (result.error) throw new Error(result.error.message);
  const rows = Array.isArray(result.data) ? result.data : (result.data ? [result.data] : []);
  if (rows.length === 0) throw new RowNotWritableError(context);
}

/**
 * A delete that removes nothing is ambiguous — the day may simply have had no
 * segments. Callers pass the count that survived the delete instead; anything
 * left standing means RLS filtered the delete.
 */
export function assertDeleteApplied(
  remaining: number,
  context: { dayId?: string | null; logDate?: string | null },
): void {
  if (remaining > 0) {
    throw new RowNotWritableError({ table: 'rods_events', operation: 'delete', ...context });
  }
}

/**
 * Drop the day's offline cache so the next hydration re-pulls the authoritative
 * server row. Without this the driver keeps looking at phantom edits that were
 * never written.
 */
export async function markDayStale(logDate: string | null | undefined): Promise<void> {
  if (!logDate) return;
  try {
    await roadsideDb.rods_days_cache.delete(logDate);
  } catch (err) {
    console.error('[rods] could not invalidate the cached day', logDate, err);
  }
}