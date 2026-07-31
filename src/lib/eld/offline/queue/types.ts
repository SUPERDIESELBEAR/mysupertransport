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

/**
 * SQLSTATEs the database raises for a refusal that will be identical on every
 * replay. Class P0 is the only class Postgres reserves for user-defined
 * conditions, so every code here is a legal SQLSTATE and reaches the client
 * intact in PostgrestError.code.
 *
 * This is the primary classification signal. The message-text checks in
 * classifyError are a time-boxed fallback for entries queued by an older
 * client build; see docs/deferred-removals.md.
 *
 * Observed over PostgREST from a real supabase-js client on 2026-07-31 with a
 * signed-in driver and seeded rods_days rows: P0010, P0011, P0012, P0013,
 * P0014, P0015, P0020, P0021, P0022, P0023, P0030, P0031 — each arrived
 * verbatim in PostgrestError.code.
 *
 * P0002, P0040 and P0041 were NOT observed and cannot be, from a driver
 * client: the rods_days UPDATE and DELETE policies both require
 * `locked = false`, so RLS filters a certified row out before the lock trigger
 * runs. The write returns 0 rows and no error. They stay in this table because
 * a privileged path (service role, edge function) can still provoke them, but
 * the sync client must treat "0 rows affected" — not one of these codes — as
 * the signal that a locked row rejected a write.
 */
export const REJECTION_SQLSTATES: Readonly<Record<string, string>> = {
  P0002: 'certified log deleted',
  P0010: 'certification token required',
  P0011: 'log not found',
  P0012: 'not the log owner',
  P0013: 'certification token belongs to another log',
  P0014: 'log is not a draft',
  P0015: 'typed legal name required',
  P0020: 'incomplete duty-status entries',
  P0021: 'gap in the 24-hour period',
  P0022: 'overlapping duty-status entries',
  P0023: 'unaccounted minutes in the 24-hour period',
  P0030: 'missing required header fields',
  P0031: 'a certified log already exists for this date',
  P0040: 'certified log modified',
  P0041: 'locked log deleted',
} as const;

export function isRejectionSqlState(code: string | null): boolean {
  return code !== null && Object.prototype.hasOwnProperty.call(REJECTION_SQLSTATES, code);
}
