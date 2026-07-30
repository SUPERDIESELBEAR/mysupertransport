/**
 * Sync-queue vocabulary. Kept free of Supabase and of Dexie so both the store
 * and the runner can import it without dragging either into /roadside's graph.
 */
export type {
  SyncKind, SyncStatus, SyncErrorClass, SyncQueueEntry, MergedPacketEntry,
} from '../db';

/** Backoff schedule, in milliseconds, indexed by attempt count. */
export const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000];

export function backoffFor(attempts: number): number {
  return BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
}

/** Attempts allowed for a `server`-class failure before the entry gives up. */
export const SERVER_ATTEMPT_LIMIT = 8;

/** Succeeded entries are purged after this long. Rejected/failed never are. */
export const SUCCEEDED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Payloads carry byte-store keys, not bytes. 2 KB is far above any legitimate
 * key set and far below any file.
 */
export const MAX_PAYLOAD_BYTES = 2048;

export function assertSmallPayload(kind: string, payload: unknown): void {
  const size = new Blob([JSON.stringify(payload ?? {})]).size;
  if (size > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Sync payload for "${kind}" is ${size} bytes. Payloads hold byte-store keys, never bytes.`,
    );
  }
}

/**
 * Server errors the runner must never retry. Each is raised by name from the
 * database so the client never parses a constraint name or a SQLSTATE to tell
 * an idempotent replay from a genuine conflict.
 */
export const REJECTION_MARKERS = {
  duplicateCertifiedDate: 'rods_duplicate_certified_date',
  tokenDayMismatch: 'rods_token_day_mismatch',
  tokenRequired: 'rods_certification_token_required',
} as const;
