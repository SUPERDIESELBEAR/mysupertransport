import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type FactoringStatus = Database['public']['Enums']['broker_factoring_status'];

export const FACTORING_STATUSES: FactoringStatus[] = ['approved', 'not_approved', 'unknown', 'pending'];

export const FACTORING_STATUS_LABELS: Record<FactoringStatus, string> = {
  approved: 'Approved',
  not_approved: 'Not Approved',
  unknown: 'Unknown',
  pending: 'Pending',
};

export type BrokerContactRole = Database['public']['Enums']['broker_contact_role'];

export const BROKER_CONTACT_ROLES: BrokerContactRole[] = [
  'dispatch', 'accounts_payable', 'claims', 'after_hours', 'other',
];

export const BROKER_CONTACT_ROLE_LABELS: Record<BrokerContactRole, string> = {
  dispatch: 'Dispatch',
  accounts_payable: 'Accounts Payable',
  claims: 'Claims',
  after_hours: 'After Hours',
  other: 'Other',
};

/** 1–5, validated in the database by stamp_brokers_actor(). */
export const BROKER_RATING_VALUES = [1, 2, 3, 4, 5] as const;

export interface Broker {
  id: string;
  company_name: string;
  mc_number: string | null;
  dot_number: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  billing_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  factoring_status: FactoringStatus | null;
  factoring_status_reason: string | null;
  factoring_status_updated_at: string | null;
  payment_terms: string | null;
  avg_days_to_pay: number | null;
  /**
   * Legacy single notes blob. Read-only in the UI — attributed notes live in
   * broker_notes. Not migrated: the existing text has no author or date.
   */
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
  /** Carrier packet / broker-carrier agreement, stamped server-side. */
  carrier_packet_completed: boolean;
  carrier_packet_completed_at: string | null;
  carrier_packet_completed_by: string | null;
  broker_agreement_signed: boolean;
  broker_agreement_signed_at: string | null;
  broker_agreement_recorded_by: string | null;
  broker_agreement_document_id: string | null;
  /** Refusal to haul — distinct from factoring status. Warns, never blocks. */
  do_not_load: boolean;
  do_not_load_reason: string | null;
  do_not_load_set_at: string | null;
  do_not_load_set_by: string | null;
  rating: number | null;
  /** Number of loads referencing this broker, resolved from the embedded count. */
  load_count: number;
}


interface BrokerRow extends Omit<Broker, 'load_count'> {
  loads?: { count: number }[] | null;
}

/**
 * All brokers with the number of loads referencing each one. The load count is
 * what makes orphan/duplicate records visible on the list page.
 */
export async function fetchBrokers(): Promise<Broker[]> {
  const { data, error } = await supabase
    .from('brokers')
    .select('*, loads(count)')
    .order('company_name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as BrokerRow[]).map(row => {
    const { loads, ...broker } = row;
    return { ...broker, load_count: loads?.[0]?.count ?? 0 };
  });
}
