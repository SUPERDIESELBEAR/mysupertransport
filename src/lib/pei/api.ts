import { supabase } from '@/integrations/supabase/client';
import type {
  PEIAccident,
  PEIGFEReason,
  PEIQueueRow,
  PEIRequest,
  PEIResponse,
} from './types';

export async function fetchPEIQueue(): Promise<PEIQueueRow[]> {
  const { data, error } = await supabase.rpc('get_pei_queue');
  if (error) throw error;
  return (data ?? []) as PEIQueueRow[];
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

  const rows = dotRegulated.map((e) => ({
    application_id: applicationId,
    employer_name: String(e.company_name || e.employer_name || e.name || 'Previous Employer').trim(),
    employer_contact_name: e.contact_name || null,
    employer_contact_email: e.contact_email || e.email || null,
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