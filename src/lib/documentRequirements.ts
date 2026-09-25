/**
 * Reads the carrier's document settings (P79) for the pure paperwork rule.
 * Staff and the carrier's own drivers may read them; the database scopes the
 * rows to the caller's company. No rows means the built-in defaults.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_DOCUMENT_REQUIREMENTS,
  type DocumentRequirementRow,
  type DocumentRequirementSettings,
  type LoadChargeContext,
} from '@/lib/loadPaperwork';

export async function fetchDocumentRequirementSettings(): Promise<DocumentRequirementSettings> {
  const [rows, switchRow] = await Promise.all([
    supabase.from('document_requirements')
      .select('document_type, required_before_invoicing, applies_when, in_packet, position')
      .order('position'),
    supabase.from('document_requirement_settings').select('bol_or_pod_either').maybeSingle(),
  ]);
  if (rows.error) throw rows.error;
  if (switchRow.error) throw switchRow.error;
  return {
    bolOrPodEither: switchRow.data?.bol_or_pod_either ?? DEFAULT_DOCUMENT_REQUIREMENTS.bolOrPodEither,
    rows: (rows.data ?? []) as DocumentRequirementRow[],
  };
}

export function chargeContextFrom(chargeTypes: Array<string | null | undefined>): LoadChargeContext {
  const types = chargeTypes.map(t => (t ?? '').toLowerCase());
  return { lumperBilled: types.includes('lumper'), detentionBilled: types.includes('detention') };
}
