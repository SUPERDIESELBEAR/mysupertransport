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

/** Attempts allowed for a deterministic 4xx that the classifier cannot identify. */
export const DETERMINISTIC_SERVER_ATTEMPT_LIMIT = 2;

/**
 * Kinds that exist to TELL somebody something, and so must outlive the thing
 * they are reporting on.
 *
 * Every other kind is part of a chain: if a predecessor dies the successor is
 * pointless, so it is cancelled. These two invert that. `raise_sync_alert`
 * reports a chain that died — cancelling it with the chain would destroy the
 * only notice Management gets. `record_unlock` reports that a driver took a
 * day back, which is precisely the event that cancels a chain.
 *
 * The exemption is NEVER-DROPPED, not never-terminal. It is applied at the
 * four points a queue entry can be silently discarded or hidden:
 *   1. resolveBlocked    — transitive cancellation from a dead prerequisite
 *   2. cancelChainForDay — the authorized unlock's own cascade
 *   3. purgeSucceeded    — dependency retention must not pin the purge
 *   4. syncCounts        — the driver-facing chip counts the driver's work,
 *                          not office bookkeeping
 *
 * It is deliberately NOT applied to the attempt budget. The budget is split by
 * error class in the runner instead: `network` is unbounded for every kind,
 * because a dead zone is not a failure; `server` and `rejected` are bounded
 * for every kind, including these two, because a permanent server-side fault
 * (a check-constraint violation, say) never becomes deliverable by retrying.
 * An exempt kind that exhausts its budget is marked terminal and kept in
 * Dexie — never deleted, and never flagged against the driver's day.
 */
export const CASCADE_EXEMPT_KINDS: ReadonlySet<string> = new Set([
  'record_unlock',
  'raise_sync_alert',
  'record_divergence',
  'acknowledge_divergence',
]);

export function isCascadeExempt(kind: string): boolean {
  return CASCADE_EXEMPT_KINDS.has(kind);
}

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
 * P0002, P0040, P0041 and P0044 were NOT observed and cannot be, from a driver
 * client: the rods_days UPDATE and DELETE policies both require
 * `locked = false`, so RLS filters a certified row out before the lock trigger
 * runs. The write returns 0 rows and no error. They stay in this table because
 * a privileged path (service role, edge function) can still provoke them, but
 * the sync client must treat "0 rows affected" — not one of these codes — as
 * the signal that a locked row rejected a write.
 */
export const REJECTION_SQLSTATES: Readonly<Record<string, string>> = {
  P0002: 'certified log deleted',
  // certify_rods_day — P0010..P0031 are exclusive to this function.
  P0010: 'certification token required',
  P0011: 'log not found',
  P0012: 'not the log owner',
  P0013: 'certification token belongs to another log',
  P0014: 'log is not a draft',
  P0015: 'typed legal name required',
  P0016: 'written reason required to certify a correction',
  P0017: 'amendment carries no change record',
  P0018: 'change record supplied for a log that supersedes nothing',
  P0019: 'certification attempted on a log that is not keyed',
  P0020: 'incomplete duty-status entries',
  P0021: 'gap in the 24-hour period',
  P0022: 'overlapping duty-status entries',
  P0023: 'unaccounted minutes in the 24-hour period',
  P0030: 'missing required header fields',
  P0031: 'a certified log already exists for this date',
  P0032: 'placeholder certification legal name',
  // rods_days / rods_events lock triggers.
  P0040: 'certified log modified',
  P0041: 'locked log deleted',
  P0042: 'certified log superseded with no certified replacement in the same transaction',
  P0043: 'correction draft deleted directly instead of through discard_rods_amendment()',
  P0044: 'duty-status entries of a certified log changed',
  P0045: 'record_source changed after the log was filed',
  P0046: 'ELD-document log with no source document referenced',
  // get_or_create_short_link.
  P0050: 'invalid share token',
  P0051: 'authentication required for a short link',
  // discard_rods_amendment.
  P0070: 'correction draft not found',
  P0071: 'not the owner of the correction draft',
  P0072: 'not an uncertified correction draft',
  // create_eld_document_day.
  P0080: 'certification token required to file an ELD document',
  P0081: 'not the driver filing their own ELD document',
  P0082: 'uploaded ELD document is missing',
  P0083: 'ELD document token belongs to another log',
  P0084: 'a certified log already exists for this date',
  // enforce_rods_correction_request_update. Its own block: the correction
  // request trigger previously reused P0072..P0075, which collided with
  // discard_rods_amendment and made the code alone ambiguous.
  P0100: 'a correction request is append-only',
  P0101: 'correction request resolution pointer set by hand',
  P0102: 'only the driver may answer a correction request',
  P0103: 'correction request already resolved',
  P0104: 'a correction request can only be actioned or declined',
  P0105: 'declining a correction request requires a written response',
  P0106: 'correction request response revised after it was recorded',
  P0107: 'correction request resolution time changed after it was set',
  // enforce_eld_extension_request_write. A 395.34(d)(2) filing is a federal
  // record: once filed, its body and FMCSA's answer are frozen.
  P0110: 'extension request revised after it was filed',
  P0111: 'extension request status moved along an illegal path',
  P0112: 'granted extension recorded with no through-date',
  P0113: 'FMCSA response recorded with no date or text',
  P0114: 'filed extension request deleted',
  P0115: 'extension response time changed after it was set',
} as const;

export function isRejectionSqlState(code: string | null): boolean {
  return code !== null && Object.prototype.hasOwnProperty.call(REJECTION_SQLSTATES, code);
}

/**
 * A code identifies ONE condition in ONE function, so the runner can route on
 * the code alone. Consumers that want to group by condition regardless of
 * which operation raised it use this mapping — never a shared wire value.
 */
export const CONDITION_GROUPS: Readonly<Record<string, readonly string[]>> = {
  token_required: ['P0010', 'P0080'],
  not_owner: ['P0012', 'P0071', 'P0081'],
  token_day_mismatch: ['P0013', 'P0083'],
  not_a_draft: ['P0014', 'P0072'],
  log_not_found: ['P0011', 'P0070'],
  duplicate_certified_date: ['P0031', 'P0084'],
  locked_record: ['P0002', 'P0040', 'P0041', 'P0043', 'P0044'],
  continuity: ['P0042'],
  not_owner_of_request: ['P0102'],
  already_resolved: ['P0103'],
  // Write-once fields on an append-only compliance record. Terminal: a retry
  // of the same write can never succeed.
  append_only_record: ['P0100', 'P0101', 'P0106', 'P0107', 'P0110', 'P0114', 'P0115'],
  // Server-side refusals a re-file can satisfy but a replay never can.
  extension_filing_invalid: ['P0111', 'P0112', 'P0113'],
} as const;

export function conditionGroupFor(code: string | null): string | null {
  if (!code) return null;
  for (const [group, codes] of Object.entries(CONDITION_GROUPS)) {
    if (codes.includes(code)) return group;
  }
  return null;
}
