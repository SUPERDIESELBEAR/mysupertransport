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
  | 'notice_orphaned'
  /**
   * A `record_unlock` the office refused, or that exhausted its server budget.
   * Distinct from `sync_failed`: the driver's log is fine and is NOT flagged —
   * what is missing is the audit row for a day the driver took back.
   */
  | 'unlock_record_rejected'
  /**
   * The alert delivery path itself died. Raised nowhere — an alert about a
   * failed alert would recurse — but named so the console line and the
   * undeliverable counter describe one condition instead of prose.
   */
  | 'alert_delivery_failed'
  /**
   * A certified day was cached with ZERO segments. Distinct from
   * `certified_day_divergence`, which is two copies that disagree: here there
   * is one copy and it is structurally incapable of rendering, so the driver
   * is shown an unavailable tile for a log he signed.
   *
   * Should be unreachable — `certify_rods_day` raises P0023 for a keyed day
   * whose segments do not tile 1440 minutes — which is exactly why it alerts
   * rather than only incrementing a counter nobody reads.
   */
  | 'certified_day_no_segments'
  /**
   * A log was certified on a device that could not decode the signature
   * image, so only the structural check ran: shape, PNG header and a floor
   * byte size. The signature is present and plausible, but nothing confirmed
   * it contains ink. Not a refusal — refusing would lock a driver out of
   * certifying on their own phone — but the office should know which devices
   * are producing records on the weaker check.
   */
  | 'signature_validated_structurally_only';

export interface SyncAlertInput {
  kind: SyncAlertKind;
  /**
   * The operator this condition belongs to, or an explicit `null` when it
   * genuinely cannot be attributed. `''` is an error — see `assertOperatorId`.
   */
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
 * The one condition that cannot be alerted about: `raise_sync_alert` itself
 * went terminal. Counted and logged loudly under `alert_delivery_failed`;
 * raising another alert here would recurse forever.
 */
export function recordAlertDeliveryFailure(detail: unknown, message: string): void {
  undeliverable += 1;
  console.error(
    '[eld-sync] alert_delivery_failed — an alert could not be delivered and cannot itself be alerted on',
    detail,
    message,
  );
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
    if (input.operator_id === '') {
      // Distinct from null. An empty id is a bug at the call site, not an
      // unattributable condition, and must not be laundered into one.
      undeliverable += 1;
      console.error(
        '[eld-sync] alert carried an empty operator_id — pass an explicit null when the '
        + 'condition cannot be attributed',
        input,
      );
      return;
    }
    // An unattributable alert is a WORSE condition than an ordinary one — an
    // orphaned certified day has no owner at all — so it is raised, not
    // dropped. `raise_eld_sync_alert` accepts a null operator and the server
    // routes it to Management's bell with no driver name. It gets its own
    // coalesce bucket so it can never collapse into a real driver's alert.
    const operatorId = input.operator_id ?? null;
    const bucket = operatorId ?? 'unattributed';
    await enqueueCoalesced({
      kind: 'raise_sync_alert',
      coalesce_key: `raise_sync_alert:${input.kind}:${bucket}:${input.log_date ?? '-'}`,
      payload: {
        alert_kind: input.kind,
        operator_id: operatorId,
        log_date: input.log_date ?? null,
        detail: (input.detail ?? '').slice(0, MAX_DETAIL_CHARS),
      },
    });
  } catch (err) {
    undeliverable += 1;
    console.error('[eld-sync] alert could not be queued', input, err);
  }
}