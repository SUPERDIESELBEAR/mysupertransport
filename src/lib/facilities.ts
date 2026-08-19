import { supabase } from '@/integrations/supabase/client';

export const FACILITY_TYPES = ['shipper', 'receiver', 'both', 'yard', 'other'] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  shipper: 'Shipper',
  receiver: 'Receiver',
  both: 'Shipper & Receiver',
  yard: 'Yard',
  other: 'Other',
};

export interface Facility {
  id: string;
  facility_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  facility_type: string | null;
  default_appointment_required: boolean;
  hours_notes: string | null;
  access_notes: string | null;
  times_used: number;
  last_used_at: string | null;
  is_active: boolean;
  notes: string | null;
}

export const FACILITY_SELECT =
  'id, facility_name, address_line1, address_line2, city, state, zip, contact_name, ' +
  'contact_phone, contact_email, facility_type, default_appointment_required, hours_notes, ' +
  'access_notes, times_used, last_used_at, is_active, notes';

/** Active facilities, most-used first. */
export async function fetchFacilities(activeOnly = true): Promise<Facility[]> {
  let query = supabase.from('facilities').select(FACILITY_SELECT);
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query
    .order('times_used', { ascending: false })
    .order('facility_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Facility[];
}
