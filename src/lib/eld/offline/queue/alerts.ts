/**
 * Loud alerting for sync outcomes a driver must not be left to discover at a
 * roadside inspection. Imports Supabase, so it is reachable only from the
 * runner — never from /roadside's import graph.
 */
import { supabase } from '@/integrations/supabase/client';

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

/**
 * Best-effort: an alert that cannot be delivered must never take down the
 * queue entry it describes. The entry's own terminal status in Dexie remains
 * the durable record, and the driver-facing banner reads from that.
 */
export async function raiseSyncAlert(input: SyncAlertInput): Promise<void> {
  try {
    await supabase.functions.invoke('eld-sync-alert', { body: input });
  } catch (err) {
    console.error('[eld-sync] alert delivery failed', input, err);
  }
}