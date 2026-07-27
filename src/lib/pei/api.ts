import { supabase } from '@/integrations/supabase/client';
import type {
  PEIAccident,
  PEIGFEReason,
  PEIQueueRow,
  PEIRequest,
  PEIResponse,
  PEIRequestEvent,
  PEIRequestEventType,
} from './types';

export async function fetchPEIQueue(): Promise<PEIQueueRow[]> {
  const { data, error } = await supabase.rpc('get_pei_queue');
  if (error) throw error;
  return ((data ?? []) as unknown) as PEIQueueRow[];
}

/** Records (or corrects) the date a PEI was sent outside the app. No email is sent. */
export async function logManualSend(
  requestId: string,
  dateSent: string,
  method: string,
  note?: string
): Promise<void> {
  const { error } = await supabase.rpc('log_pei_manual_send', {
    _request_id: requestId,
    _date_sent: dateSent,
    _method: method,
    _note: note ?? null,
  });
  if (error) throw error;
}

export async function logPhoneAttempt(
  requestId: string,
  attemptDate: string,
  spokeWith: string,
  outcome: string
): Promise<void> {
  const { error } = await supabase.rpc('log_pei_phone_attempt', {
    _request_id: requestId,
    _attempt_date: attemptDate,
    _spoke_with: spokeWith,
    _outcome: outcome,
  });
  if (error) throw error;
}

export async function addStaffNote(requestId: string, note: string): Promise<void> {
  const { error } = await supabase.rpc('add_pei_staff_note', {
    _request_id: requestId,
    _note: note,
  });
  if (error) throw error;
}

export async function archiveApplicant(
  applicationId: string,
  reason: string,
  archiveCategory: 'hired' | 'not_hired'
): Promise<void> {
  const { error } = await supabase.rpc('archive_applicant_pei', {
    _application_id: applicationId,
    _reason: reason,
    _archive_category: archiveCategory,
  });
  if (error) throw error;
}

export async function restoreApplicant(applicationId: string): Promise<void> {
  const { error } = await supabase.rpc('restore_applicant_pei', {
    _application_id: applicationId,
  });
  if (error) throw error;
}

/** Marks a set of PEI requests resolved as Completed (staff override). */
export async function bulkMarkCompleted(requestIds: string[]): Promise<void> {
  if (requestIds.length === 0) return;
  const { error } = await supabase
    .from('pei_requests')
    .update({
      status: 'completed',
      date_response_received: new Date().toISOString(),
    } as any)
    .in('id', requestIds);
  if (error) throw error;
}

/** Runs an async op over many ids, collecting failures instead of aborting. */
export async function runBulk<T>(
  ids: T[],
  fn: (id: T) => Promise<void>
): Promise<{ ok: number; failed: number; firstError?: string }> {
  let ok = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const id of ids) {
    try {
      await fn(id);
      ok++;
    } catch (e: any) {
      failed++;
      firstError ??= e?.message ?? 'Operation failed';
    }
  }
  return { ok, failed, firstError };
}

export async function fetchPEIRequestsByApplication(
  applicationId: string
): Promise<PEIRequest[]> {
  const { data, error } = await supabase
    .from('pei_requests')
    .select('*')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PEIRequest[];
}

export async function fetchPEIResponse(requestId: string): Promise<PEIResponse | null> {
  const { data, error } = await supabase
    .from('pei_responses')
    .select('*')
    .eq('pei_request_id', requestId)
    .maybeSingle();
  if (error) throw error;
  return (data as PEIResponse | null) ?? null;
}

export async function fetchPEIAccidents(responseId: string): Promise<PEIAccident[]> {
  const { data, error } = await supabase
    .from('pei_accidents')
    .select('*')
    .eq('pei_response_id', responseId)
    .order('accident_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PEIAccident[];
}

export async function fetchPEIRequestEvents(
  requestId: string
): Promise<PEIRequestEvent[]> {
  const { data, error } = await supabase
    .from('pei_request_events')
    .select('*')
    .eq('pei_request_id', requestId)
    .order('occurred_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown) as PEIRequestEvent[];
}

/**
 * Fire-and-forget interaction logger. Never throws — logging failures must
 * not block the previous employer from completing the form.
 */
export async function logPEIEvent(
  token: string,
  eventType: PEIRequestEventType,
  responseId?: string
): Promise<void> {
  try {
    await supabase.functions.invoke('log-pei-event', {
      body: { token, event_type: eventType, response_id: responseId },
    });
  } catch (err) {
    console.warn('[logPEIEvent] non-fatal:', err);
  }
}

export async function createPEIRequest(
  data: Partial<PEIRequest> & { application_id: string; employer_name: string }
): Promise<PEIRequest> {
  const { data: row, error } = await supabase
    .from('pei_requests')
    .insert(data as any)
    .select('*')
    .single();
  if (error) throw error;
  return row as PEIRequest;
}

export async function updatePEIRequest(
  id: string,
  patch: Partial<PEIRequest>
): Promise<PEIRequest> {
  const { data, error } = await supabase
    .from('pei_requests')
    .update(patch as any)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as PEIRequest;
}

export async function deletePEIRequest(id: string): Promise<void> {
  const { error } = await supabase.from('pei_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function createGoodFaithEffort(
  requestId: string,
  reason: PEIGFEReason,
  otherReason: string | null,
  staffId: string,
  staffName: string
): Promise<void> {
  const { error } = await supabase
    .from('pei_requests')
    .update({
      status: 'gfe_documented',
      date_gfe_created: new Date().toISOString(),
      gfe_reason: reason,
      gfe_other_reason: otherReason,
      gfe_signed_by_staff_id: staffId,
      gfe_signed_by_name: staffName,
    } as any)
    .eq('id', requestId);
  if (error) throw error;
}

/**
 * Reads the application's `employers` jsonb, picks entries that are DOT-regulated
 * and ended within the last 3 years, and creates one pei_request per qualifying
 * employer. If none qualify, creates a single GFE record citing not_dot_regulated
 * (satisfies §391.23(c)(4)).
 */
export async function autoBuildPEIRequests(applicationId: string): Promise<{
  created: number;
  gfeAuto: boolean;
}> {
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select('id, employers')
    .eq('id', applicationId)
    .single();
  if (appErr) throw appErr;

  const employers = (app?.employers as any[]) ?? [];
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 3);

  const dotRegulated = employers.filter((e) => {
    if (!e) return false;
    const isDot =
      e.is_dot_regulated === true ||
      e.cmv_position === 'yes' ||
      e.cmv_position === true;
    if (!isDot) return false;
    // employment dates may be MM/YYYY strings — try to parse end date
    const end = parseEmployerDate(e.end_date || e.employment_end_date);
    if (!end) return true; // include if we can't tell; staff can prune
    return end >= cutoff;
  });

  if (dotRegulated.length === 0) {
    await supabase.from('pei_requests').insert({
      application_id: applicationId,
      employer_name: 'No DOT-regulated employment in preceding 3 years',
      is_dot_regulated: false,
      status: 'gfe_documented',
      date_gfe_created: new Date().toISOString(),
      gfe_reason: 'not_dot_regulated',
    } as any);

    await supabase
      .from('applications')
      .update({ pei_deadline: addDays(new Date(), 30).toISOString().slice(0, 10) } as any)
      .eq('id', applicationId);
    return { created: 1, gfeAuto: true };
  }

  const extractEmail = (raw: unknown): string | null => {
    if (!raw) return null;
    const m = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return m ? m[0].trim().toLowerCase() : null;
  };
  const rows = dotRegulated.map((e) => ({
    application_id: applicationId,
    employer_name: String(e.company_name || e.employer_name || e.name || 'Previous Employer').trim(),
    employer_contact_name: e.contact_name || null,
    employer_contact_email: extractEmail(e.contact_email || e.email),
    employer_phone: e.phone || null,
    employer_address: e.address || null,
    employer_city: e.city || null,
    employer_state: e.state || null,
    employer_postal_code: e.zip || e.postal_code || null,
    employment_start_date: parseEmployerDate(e.start_date || e.employment_start_date)?.toISOString().slice(0, 10) || null,
    employment_end_date: parseEmployerDate(e.end_date || e.employment_end_date)?.toISOString().slice(0, 10) || null,
    is_dot_regulated: true,
    status: 'pending' as const,
  }));

  const { error: insErr } = await supabase.from('pei_requests').insert(rows as any);
  if (insErr) throw insErr;

  await supabase
    .from('applications')
    .update({ pei_deadline: addDays(new Date(), 30).toISOString().slice(0, 10) } as any)
    .eq('id', applicationId);

  return { created: rows.length, gfeAuto: false };
}

// Local helpers
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseEmployerDate(value: unknown): Date | null {
  if (!value || typeof value !== 'string') return null;
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00`);
  // MM/YYYY
  const m = value.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[2]), Number(m[1]) - 1, 15, 12, 0, 0);
  // YYYY-MM
  const m2 = value.match(/^(\d{4})-(\d{1,2})$/);
  if (m2) return new Date(Number(m2[1]), Number(m2[2]) - 1, 15, 12, 0, 0);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}