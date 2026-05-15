export type PEIRequestStatus =
  | 'pending'
  | 'sent'
  | 'follow_up_sent'
  | 'final_notice_sent'
  | 'completed'
  | 'gfe_documented';

export type PEIGFEReason =
  | 'no_response'
  | 'refused'
  | 'not_located'
  | 'no_longer_in_business'
  | 'not_dot_regulated'
  | 'owner_of_company'
  | 'other';

export type PEIPerformanceRating = 'excellent' | 'good' | 'poor';
export type PEILeavingReason = 'discharged' | 'laid_off' | 'resigned' | 'other';
export type PEIApplicantStatus = 'not_started' | 'in_progress' | 'complete';

export interface PEIRequest {
  id: string;
  application_id: string;
  employer_name: string;
  employer_contact_name: string | null;
  employer_contact_email: string | null;
  employer_phone: string | null;
  employer_address: string | null;
  employer_city: string | null;
  employer_state: string | null;
  employer_country: string | null;
  employer_postal_code: string | null;
  employment_start_date: string | null;
  employment_end_date: string | null;
  is_dot_regulated: boolean;
  status: PEIRequestStatus;
  date_sent: string | null;
  date_follow_up_sent: string | null;
  date_final_notice_sent: string | null;
  date_response_received: string | null;
  date_gfe_created: string | null;
  gfe_reason: PEIGFEReason | null;
  gfe_other_reason: string | null;
  gfe_signed_by_staff_id: string | null;
  gfe_signed_by_name: string | null;
  gfe_document_url: string | null;
  response_token: string;
  response_token_used: boolean;
  sent_by_staff_id: string | null;
  response_document_url: string | null;
  deadline_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PEIQueueRow {
  request_id: string;
  application_id: string;
  applicant_first_name: string | null;
  applicant_last_name: string | null;
  employer_name: string;
  employer_city: string | null;
  employer_state: string | null;
  status: PEIRequestStatus;
  date_sent: string | null;
  deadline_date: string | null;
  days_remaining: number | null;
  is_overdue: boolean;
}

export interface PEIResponse {
  id: string;
  pei_request_id: string;
  was_employed: boolean | null;
  dates_accurate: boolean | null;
  actual_start_date: string | null;
  actual_end_date: string | null;
  safe_and_efficient: boolean | null;
  equipment_straight_truck: boolean | null;
  equipment_tractor_semi: boolean | null;
  equipment_bus: boolean | null;
  reason_for_leaving: PEILeavingReason | null;
  reason_detail: string | null;
  had_accidents: boolean | null;
  drug_alcohol_violation: boolean | null;
  failed_rehab: boolean | null;
  post_rehab_violations: boolean | null;
  drug_alcohol_notes: string | null;
  rating_quality_of_work: PEIPerformanceRating | null;
  rating_cooperation: PEIPerformanceRating | null;
  rating_safety_habits: PEIPerformanceRating | null;
  rating_personal_habits: PEIPerformanceRating | null;
  rating_driving_skills: PEIPerformanceRating | null;
  rating_attitude: PEIPerformanceRating | null;
  trailer_van: boolean | null;
  trailer_flatbed: boolean | null;
  trailer_reefer: boolean | null;
  trailer_cargo_tank: boolean | null;
  trailer_triples: boolean | null;
  trailer_doubles: boolean | null;
  trailer_na: boolean | null;
  responder_name: string;
  responder_title: string | null;
  responder_company: string | null;
  responder_phone: string | null;
  responder_email: string | null;
  responder_city: string | null;
  responder_state: string | null;
  responder_postal_code: string | null;
  responder_signature_data: string | null;
  date_signed: string | null;
  submission_method: string | null;
  created_at: string;
  signed_at?: string | null;
  signed_ip?: string | null;
  signed_user_agent?: string | null;
}

export interface PEIAccident {
  id: string;
  pei_response_id: string;
  accident_date: string | null;
  location_city_state: string | null;
  number_of_injuries: number | null;
  number_of_fatalities: number | null;
  hazmat_spill: boolean | null;
  created_at: string;
}

export type PEIRequestEventType =
  | 'opened_response_link'
  | 'opened_release_link'
  | 'submitted';

export interface PEIRequestEvent {
  id: string;
  pei_request_id: string;
  event_type: PEIRequestEventType;
  occurred_at: string;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

export const STATUS_LABEL: Record<PEIRequestStatus, string> = {
  pending: 'Not Sent',
  sent: 'Sent',
  follow_up_sent: 'Follow-Up Sent',
  final_notice_sent: 'Final Notice Sent',
  completed: 'Completed',
  gfe_documented: 'GFE Documented',
};

export const GFE_REASON_LABEL: Record<PEIGFEReason, string> = {
  no_response: 'Previous employer did not respond within 30 days',
  refused: 'Previous employer refused to release information',
  not_located: 'Previous employer moved and could not be located',
  no_longer_in_business: 'Previous employer is no longer in business',
  not_dot_regulated: 'Applicant had no DOT-regulated employment in preceding 3 years',
  owner_of_company: 'Applicant was owner of previous company',
  other: 'Other',
};