import type { TablesInsert } from '@/integrations/supabase/types';

/**
 * Tables whose company_id is NOT NULL but always filled by a BEFORE INSERT
 * stamp trigger (stamp_application_company on applications/application_invites,
 * stamp_child_company_from_parent on the nine children). The caller must NOT
 * name a carrier — the database derives it and refuses a disagreeing one.
 */
export type StampedCompanyTable =
  | 'applications'
  | 'application_invites'
  | 'application_correction_requests'
  | 'application_correction_fields'
  | 'application_document_history'
  | 'application_interview_notes'
  | 'application_revision_attachments'
  | 'pei_requests'
  | 'pei_responses'
  | 'pei_accidents'
  | 'pei_request_events';

/** Build an insert row for a stamped table without a caller-supplied company_id. */
export function stampedInsert<T extends StampedCompanyTable>(
  row: Omit<TablesInsert<T>, 'company_id'> & { company_id?: never },
): TablesInsert<T> {
  return row as TablesInsert<T>;
}
