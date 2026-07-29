import {
  fetchPEIRequestsByApplication,
  fetchPEIResponse,
  fetchPEIAccidents,
  fetchPEIRequestEvents,
} from './api';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCombinedPrintHtml,
  openPrintWindow,
  type CombinedRecordInput,
} from './printRecord';

/**
 * Fetches every PEI request for the applicant, plus each request's response,
 * accidents, and audit events, then opens a single stitched print window.
 * Throws on popup-blocked / fetch failure so the caller can toast.
 */
export async function printCombinedPEIHistory(
  applicationId: string,
  applicantNameOverride?: string,
): Promise<{ recordCount: number }> {
  const requests = await fetchPEIRequestsByApplication(applicationId);
  if (requests.length === 0) {
    throw new Error('No PEI records to print for this applicant yet.');
  }

  // Sort chronologically by initial send date (fallback to created_at) so the
  // stitched PDF reads in the order the investigations were initiated.
  const ordered = [...requests].sort((a, b) => {
    const ta = new Date(a.date_sent ?? a.created_at).getTime();
    const tb = new Date(b.date_sent ?? b.created_at).getTime();
    return ta - tb;
  });

  const records: CombinedRecordInput[] = await Promise.all(
    ordered.map(async (request) => {
      const [response, events] = await Promise.all([
        fetchPEIResponse(request.id).catch(() => null),
        fetchPEIRequestEvents(request.id).catch(() => []),
      ]);
      const accidents = response
        ? await fetchPEIAccidents(response.id).catch(() => [])
        : [];
      return { request, response, accidents, events };
    }),
  );

  let applicantName = applicantNameOverride ?? '';
  if (!applicantName) {
    const { data } = await supabase
      .from('applications')
      .select('first_name, last_name')
      .eq('id', applicationId)
      .maybeSingle();
    applicantName = [data?.first_name, data?.last_name].filter(Boolean).join(' ');
  }

  const html = buildCombinedPrintHtml({ applicantName, records });
  openPrintWindow(html);
  return { recordCount: records.length };
}