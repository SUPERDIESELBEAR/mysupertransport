/**
 * The only two ways to put a divergence on the wire.
 *
 * Both kinds are cascade-exempt (see CASCADE_EXEMPT_KINDS): a divergence is
 * raised precisely when a day's chain is in doubt, so that chain must never be
 * able to cancel the report of it — or the resolution of the report.
 *
 * Type-only imports of the Dexie row: this module must not pull the Supabase
 * client into /roadside's import graph.
 */
import type { RodsDivergenceEntry } from '../db';
import { enqueue } from './store';
import type { SyncQueueEntry } from './types';

/**
 * Deterministic ids. The report id is also the server-side idempotency key, so
 * a re-detection of the same unresolved mismatch on the same day is one row and
 * one queue entry, not one per hydration pass.
 */
export function divergenceReportId(operatorId: string, logDate: string, detectedAt: string): string {
  return `divergence:${operatorId}:${logDate}:${detectedAt}`;
}

export function divergenceAckId(operatorId: string, logDate: string): string {
  return `divergence-ack:${operatorId}:${logDate}`;
}

/** File the observation with the office. */
export async function enqueueDivergenceReport(
  row: RodsDivergenceEntry,
  deviceInfo: string | null,
): Promise<SyncQueueEntry> {
  const key = divergenceReportId(row.operator_id, row.log_date, row.detected_at);
  return enqueue({
    id: key,
    kind: 'record_divergence',
    payload: {
      operator_id: row.operator_id,
      log_date: row.log_date,
      local_row_id: row.local_row_id ?? null,
      server_row_id: row.server_row_id ?? null,
      differing_fields: row.differing_fields ?? [],
      local_values: row.local_values ?? {},
      server_values: row.server_values ?? {},
      detected_at: row.detected_at,
      device_info: deviceInfo,
      idempotency_key: key,
    },
  });
}

/**
 * Propagate a device-side resolution.
 *
 * Deliberately NOT dependent on the report entry: the handler resolves the row
 * by (operator, date) when the report has not drained yet, and a missing server
 * row is a no-op success. Chaining them would let a stuck report hold the
 * acknowledgement hostage.
 */
export async function enqueueDivergenceAck(input: {
  operatorId: string;
  logDate: string;
  reason: string;
  divergenceId?: string | null;
}): Promise<SyncQueueEntry> {
  return enqueue({
    id: divergenceAckId(input.operatorId, input.logDate),
    kind: 'acknowledge_divergence',
    payload: {
      operator_id: input.operatorId,
      log_date: input.logDate,
      reason: input.reason,
      divergence_id: input.divergenceId ?? null,
    },
  });
}
