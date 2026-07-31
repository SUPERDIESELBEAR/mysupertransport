import { REJECTION_MARKERS, isRejectionSqlState, type SyncErrorClass } from './types';
import { isRowNotWritable, ROW_NOT_WRITABLE_MESSAGE } from '@/lib/eld/rodsWrite';

/**
 * Count of classifications that had to fall back to reading message text.
 * The SQLSTATE path (class P0) is authoritative; a non-zero count here means
 * entries queued by an older client build are still draining, or the server
 * raised a refusal without a P0 code. The string fallback is removed once this
 * reads zero for 30 consecutive days -- see docs/deferred-removals.md.
 */
let stringFallbackHits = 0;

export function classifyStringFallbackCount(): number {
  return stringFallbackHits;
}

/** Test seam. Production code never calls this. */
export function resetClassifyStringFallbackCount(): void {
  stringFallbackHits = 0;
}

function noteStringFallback(message: string): void {
  stringFallbackHits += 1;
  // Stable tag so the counter is greppable in captured console output.
  console.warn('eld_sync_classify_string_fallback', { hits: stringFallbackHits, message });
}

/**
 * Classify a sync failure.
 *
 * The three classes decide retry behaviour, not blame:
 *   network  — transient. Retried forever; a driver in a dead zone for a week
 *              must still sync on day eight.
 *   server   — a 4xx that is not a named rejection. Retried a bounded number
 *              of times, then parked as `failed` for a human.
 *   rejected — the server said no, by name, and will say no again. Never
 *              retried; routed to the rejection path.
 *   row_not_writable — RLS filtered the write: 0 rows, no error. Terminal for
 *              the same reason as `rejected`, but distinct because there is no
 *              server error to quote and the driver-facing copy differs.
 *
 * This function must NEVER parse constraint names or SQLSTATEs to tell a
 * harmless replay from a real conflict. That disambiguation happens inside
 * certify_rods_day via GET STACKED DIAGNOSTICS, which either returns the
 * existing row as a no-op or raises one of the named markers below. A raw
 * 23505 reaching here is a server bug, and is treated as `server` so it parks
 * for a human instead of firing the duplicate alarm at a driver whose day
 * certified perfectly.
 */
export function classifyError(err: unknown): { klass: SyncErrorClass; message: string } {
  // Checked first: a RowNotWritableError carries no status and no SQLSTATE, so
  // every branch below would misread it.
  if (isRowNotWritable(err)) {
    return { klass: 'row_not_writable', message: ROW_NOT_WRITABLE_MESSAGE };
  }

  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();

  // Authoritative path: a class-P0 SQLSTATE from the database names the
  // refusal exactly, with no text parsing.
  if (isRejectionSqlState(extractSqlState(err))) return { klass: 'rejected', message };

  for (const marker of Object.values(REJECTION_MARKERS)) {
    if (message.includes(marker)) {
      noteStringFallback(message);
      return { klass: 'rejected', message };
    }
  }

  // Guards that will fail identically on every replay: the record is locked,
  // superseded, or not the caller's. Retrying cannot change the answer.
  if (
    lower.includes('only a draft log can be certified')
    || lower.includes('only the driver may')
    || lower.includes('has already been replaced')
  ) {
    noteStringFallback(message);
    return { klass: 'rejected', message };
  }

  const status = extractStatus(err);
  if (status !== null) {
    if (status === 429 || status >= 500) return { klass: 'network', message };
    if (status >= 400) return { klass: 'server', message };
  }

  if (
    err instanceof TypeError
    || lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('load failed')
    || lower.includes('timeout')
    || lower.includes('timed out')
    || (typeof navigator !== 'undefined' && navigator.onLine === false)
  ) {
    return { klass: 'network', message };
  }

  return { klass: 'server', message };
}

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  for (const key of ['status', 'statusCode', 'httpStatus']) {
    const v = rec[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^\d{3}$/.test(v)) return Number(v);
  }
  return null;
}

/**
 * PostgrestError carries the SQLSTATE in `code`. Some transports nest the
 * error one level down, and PostgREST 4xx bodies use the same field name.
 */
export function extractSqlState(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const rec = err as Record<string, unknown>;
  const direct = rec.code;
  if (typeof direct === 'string' && /^[0-9A-Z]{5}$/.test(direct)) return direct;
  const nested = rec.error;
  if (nested && typeof nested === 'object') {
    const inner = (nested as Record<string, unknown>).code;
    if (typeof inner === 'string' && /^[0-9A-Z]{5}$/.test(inner)) return inner;
  }
  return null;
}

/** True when the server rejected because a certified log already exists. */
export function isDuplicateDateRejection(message: string): boolean {
  return message.includes(REJECTION_MARKERS.duplicateCertifiedDate);
}
