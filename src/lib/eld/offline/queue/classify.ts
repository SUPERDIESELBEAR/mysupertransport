import { REJECTION_MARKERS, type SyncErrorClass } from './types';

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
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = message.toLowerCase();

  for (const marker of Object.values(REJECTION_MARKERS)) {
    if (message.includes(marker)) return { klass: 'rejected', message };
  }

  // Guards that will fail identically on every replay: the record is locked,
  // superseded, or not the caller's. Retrying cannot change the answer.
  if (
    lower.includes('only a draft log can be certified')
    || lower.includes('only the driver may')
    || lower.includes('has already been replaced')
  ) {
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

/** True when the server rejected because a certified log already exists. */
export function isDuplicateDateRejection(message: string): boolean {
  return message.includes(REJECTION_MARKERS.duplicateCertifiedDate);
}
