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
  notes: string | null;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
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
