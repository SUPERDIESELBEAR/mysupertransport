/**
 * Log correction requests.
 *
 * Management can read a driver's certified logs and ask for one to be looked
 * at again. The request is anchored on (operator_id, log_date); `rods_day_id`
 * is provenance only — which version prompted it — so a request survives the
 * day being superseded by an amendment.
 *
 * A request is closed by fact, not by a button: `certify_rods_day` closes any
 * open request for that date inside the certifying transaction. The only thing
 * the driver can do by hand is decline, with a written response.
 *
 * Note on device state: the console cannot see whether a driver's log is
 * stalled or rejected in his local cache — that lives in Dexie on the phone
 * and has no server-side column. So raising is always permitted against a
 * certified day, and the driver's own view is where "you can't act on this
 * yet, and here's why" is shown.
 */
import { supabase } from '@/integrations/supabase/client';

export type CorrectionStatus = 'open' | 'actioned' | 'declined';

export interface CorrectionRequest {
  id: string;
  operator_id: string;
  log_date: string;
  rods_day_id: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  requested_at: string;
  issue: string;
  status: CorrectionStatus;
  driver_response: string | null;
  resolved_at: string | null;
  resolved_by_day_id: string | null;
  created_at: string;
  updated_at: string;
}

export const CORRECTION_STATUS_LABEL: Record<CorrectionStatus, string> = {
  open: 'Open',
  actioned: 'Actioned',
  declined: 'Declined',
};

/** Every request raised against a driver, newest first. */
export async function fetchCorrectionRequests(
  operatorId: string,
  logDate?: string,
): Promise<CorrectionRequest[]> {
  let q = supabase
    .from('rods_correction_requests')
    .select('*')
    .eq('operator_id', operatorId)
    .order('requested_at', { ascending: false });
  if (logDate) q = q.eq('log_date', logDate);
  const { data, error } = await q;
  if (error) {
    console.error('[fetchCorrectionRequests] failed', error);
    return [];
  }
  return (data ?? []) as CorrectionRequest[];
}

/** The one open request for a date, if there is one. */
export async function fetchOpenCorrectionRequest(
  operatorId: string,
  logDate: string,
): Promise<CorrectionRequest | null> {
  const { data, error } = await supabase
    .from('rods_correction_requests')
    .select('*')
    .eq('operator_id', operatorId)
    .eq('log_date', logDate)
    .eq('status', 'open')
    .maybeSingle();
  if (error) {
    console.error('[fetchOpenCorrectionRequest] failed', error);
    return null;
  }
  return (data as CorrectionRequest | null) ?? null;
}

/**
 * Raise a request. `operator_id` and `log_date` are stamped server-side from
 * the named day, which must be currently certified; the partial unique index
 * refuses a second open request for the same date.
 */
export async function raiseCorrectionRequest(args: {
  rodsDayId: string;
  operatorId: string;
  logDate: string;
  issue: string;
  requestedBy: string;
  requestedByName: string | null;
}): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('rods_correction_requests').insert({
    rods_day_id: args.rodsDayId,
    operator_id: args.operatorId,
    log_date: args.logDate,
    issue: args.issue.trim(),
    requested_by: args.requestedBy,
    requested_by_name: args.requestedByName,
  });
  if (error) {
    const duplicate = error.message.includes('one_open_per_date');
    return {
      ok: false,
      message: duplicate
        ? 'There is already an open correction request for this date.'
        : error.message,
    };
  }
  return { ok: true };
}

/** The driver's written refusal. Amending closes a request without this path. */
export async function declineCorrectionRequest(
  id: string,
  response: string,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase
    .from('rods_correction_requests')
    .update({ status: 'declined', driver_response: response.trim() })
    .eq('id', id);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
