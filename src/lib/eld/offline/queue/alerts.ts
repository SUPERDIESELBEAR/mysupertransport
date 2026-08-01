/**
 * Loud alerting for sync outcomes a driver must not be left to discover at a
 * roadside inspection.
 *
 * Delivery goes through the sync queue to a TABLE, not to an edge function.
 * An alert is raised at exactly the moments the network is least trustworthy —
 * a chain just died, often offline — so a direct call is the one delivery
 * method guaranteed to be unavailable when it is needed. Queued, it survives
 * the dead zone and drains with everything else.
 *
 * Dexie only: no Supabase import here, so /roadside's import graph stays
 * clean. The `raise_sync_alert` handler is where this meets the network.
 */
import { enqueueCoalesced } from './store';

export type SyncAlertKind =
  | 'certification_rejected'
  | 'sync_failed'
  | 'log_not_writable'
  | 'certified_day_divergence'
  | 'notice_drain_corrupt'
  | 'notice_orphaned';

export interface SyncAlertInput {
  kind: SyncAlertKind;
  operator_id?: string | null;
  log_date?: string | null;
  detail: string;
}

/** Payloads hold keys, not prose. Enough to identify the condition, no more. */
const MAX_DETAIL_CHARS = 500;

/**
 * Alerts that could not even be QUEUED. Not a delivery count — a queued alert
 * is durable and the runner owns it from there — but a count of the one
 * failure mode that loses an alert outright.
 *
 * Exposed so tests can assert it stays at zero. A non-zero value in production
 * means Dexie itself refused a write, which is a device-level fault.
 */
let undeliverable = 0;

export function undeliverableAlertCount(): number {
  return undeliverable;
}

export function resetUndeliverableAlertCount(): void {
  undeliverable = 0;
}

/**
 * Queue an alert for Management.
 *
 * Never throws: an alert that cannot be raised must not take down the queue
 * entry it describes. But it is not silent either — the previous version
 * swallowed a 404 from a missing edge function and reported nothing, so every
 * alert this system ever raised went nowhere and no one could tell. A failure
 * here is logged at error level and counted.
 *
 * Coalesced per condition so a repeating fault produces one pending entry, not
 * hundreds. The server counts recurrences on its own row.
 */
export async function raiseSyncAlert(input: SyncAlertInput): Promise<void> {
  try {
    if (!input.operator_id) {
      // The RPC resolves ownership from auth.uid() and refuses a write it
      // cannot attribute. Nothing to queue.
      undeliverable += 1;
      console.error('[eld-sync] alert has no operator_id and cannot be delivered', input);
      return;
    }
    await enqueueCoalesced({
      kind: 'raise_sync_alert',
      coalesce_key: `raise_sync_alert:${input.kind}:${input.operator_id}:${input.log_date ?? '-'}`,
      payload: {
        alert_kind: input.kind,
        operator_id: input.operator_id,
        log_date: input.log_date ?? null,
        detail: (input.detail ?? '').slice(0, MAX_DETAIL_CHARS),
      },
    });
  } catch (err) {
    undeliverable += 1;
    console.error('[eld-sync] alert could not be queued', input, err);
  }
}